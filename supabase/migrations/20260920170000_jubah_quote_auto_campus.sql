-- Both resolve paths already return which rider negotiated the quote
-- (created_by) -- that rider's own primary active campus assignment is
-- now also returned, so the frontend can skip straight past "Select
-- Campus" too instead of leaving the customer to manually pick it before
-- the rider auto-fill (which only runs once campus is set) can ever kick
-- in. Picks the same "earliest active assignment" a rider's own primary
-- one is defined as elsewhere (set_rider_jubah_assignment).

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
  select campus into v_campus from public.jubah_rider_assignments
    where rider_id = v_quote.created_by and is_active = true
    order by created_at limit 1;

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'customer_phone', v_quote.customer_phone,
    'rider_id', v_quote.created_by,
    'rider_name', v_rider_name,
    'campus', v_campus,
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
  select campus into v_campus from public.jubah_rider_assignments
    where rider_id = v_quote.created_by and is_active = true
    order by created_at limit 1;

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'customer_phone', v_quote.customer_phone,
    'rider_id', v_quote.created_by,
    'rider_name', v_rider_name,
    'campus', v_campus,
    'expires_at', v_quote.expires_at
  );
end;
$$;
