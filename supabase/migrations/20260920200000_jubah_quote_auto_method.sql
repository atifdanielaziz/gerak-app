-- Fully automatic this time -- no admin-filled Service Option field.
-- jubah_rider_assignments already pairs campus + method together in one
-- row; both resolve paths now pull both from that SAME row instead of
-- just campus, and return method as payment_mode. Jubah.tsx sets
-- paymentMode from it before the rider list loads, so "Select Rider"
-- is never left filtered to a method the quote's rider isn't assigned to.

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
    and claimed_at is null
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'This quote is invalid, expired, already claimed, or does not match this IC number.'
    );
  end if;

  update public.jubah_custom_quotes set claimed_at = now() where id = v_quote.id;

  select name into v_rider_name from public.profiles where id = v_quote.created_by;
  select campus, method into v_campus, v_method from public.jubah_rider_assignments
    where rider_id = v_quote.created_by and is_active = true
    order by created_at limit 1;

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

create or replace function public.resolve_jubah_custom_quote_by_ic(p_ic_number text)
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
  perform public.check_jubah_rate_limit();

  select * into v_quote
  from public.jubah_custom_quotes
  where ic_hash = encode(extensions.digest(regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex')
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'No active quote found for this IC number.');
  end if;

  update public.jubah_custom_quotes
  set claimed_at = coalesce(claimed_at, now())
  where id = v_quote.id;

  select name into v_rider_name from public.profiles where id = v_quote.created_by;
  select campus, method into v_campus, v_method from public.jubah_rider_assignments
    where rider_id = v_quote.created_by and is_active = true
    order by created_at limit 1;

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
