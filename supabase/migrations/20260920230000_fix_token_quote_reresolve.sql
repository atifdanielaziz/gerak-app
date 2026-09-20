-- Same fix as 20260920160000 (fix_ic_only_quote_reresolve), applied to the
-- token-based path too — confirmed live: a customer verified a quote
-- successfully (claimed_at set) but didn't finish the booking in one
-- sitting (closed the tab, lost connection, etc.), and their retry with
-- the same link+IC was permanently rejected as "already claimed" even
-- though nothing was ever actually booked. used_at (set only once
-- create_custom_jubah_booking succeeds) is the real one-time-use gate;
-- claimed_at is now purely an observability timestamp here too, matching
-- resolve_jubah_custom_quote_by_ic.

create or replace function public.resolve_jubah_custom_quote(p_token text, p_ic_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_quote public.jubah_custom_quotes%rowtype;
  v_rider_name text;
  v_campus text;
  v_method text;
begin
  select * into v_quote
  from public.jubah_custom_quotes
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and ic_hash = encode(extensions.digest(regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex')
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'This quote is invalid, expired, or does not match this IC number.'
    );
  end if;

  update public.jubah_custom_quotes set claimed_at = coalesce(claimed_at, now()) where id = v_quote.id;

  select name into v_rider_name from public.profiles where id = v_quote.created_by;
  if v_quote.campus is not null then
    v_campus := v_quote.campus;
    select method into v_method from public.jubah_rider_assignments
      where rider_id = v_quote.created_by and campus = v_quote.campus and is_active = true
      order by created_at limit 1;
  else
    select campus, method into v_campus, v_method from public.jubah_rider_assignments
      where rider_id = v_quote.created_by and is_active = true
      order by created_at limit 1;
  end if;

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'customer_phone', v_quote.customer_phone,
    'rider_id', v_quote.created_by,
    'rider_name', v_rider_name,
    'campus', v_campus,
    'payment_mode', v_method,
    'expires_at', v_quote.expires_at
  );
end;
$$;
