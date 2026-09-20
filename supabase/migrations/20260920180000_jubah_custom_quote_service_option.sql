-- Service Option (payment_mode/deposit_method) is now captured on the
-- quote too, same as phone. This closes the actual reason the rider
-- auto-fill kept silently failing: "Select Rider" only ever shows riders
-- eligible for whichever method the customer currently has selected, and
-- the customer's default was "Full Payment — Pickup Point" -- a method
-- neither Adib's nor Atif's account is assigned to (both are postage-only).
-- Auto-filling the actual agreed method removes that mismatch entirely.
--
-- Campus is now derived by matching the quote's own method against the
-- rider's assignment for that specific method (not just "any active
-- assignment") -- more correct if a rider ever serves more than one
-- method/campus combination.

drop function if exists public.create_jubah_custom_quote(text, numeric, text);

create or replace function public.create_jubah_custom_quote(
  p_ic_number text,
  p_agreed_price numeric,
  p_customer_phone text,
  p_payment_mode text,
  p_deposit_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_role text := public.get_my_role();
  v_token text := encode(extensions.gen_random_bytes(12), 'hex');
  v_ic text := regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g');
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_price numeric := round(p_agreed_price, 2);
  v_recent_count integer;
begin
  if auth.uid() is null or v_role not in ('rider', 'admin', 'superadmin') then
    return jsonb_build_object('success', false, 'error', 'Runner access required.');
  end if;
  if length(v_ic) <> 12 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid 12-digit IC number.');
  end if;
  if length(v_phone) < 9 or length(v_phone) > 12 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid customer phone number.');
  end if;
  if v_price is null or v_price <= 0 or v_price > 10000 then
    return jsonb_build_object('success', false, 'error', 'Enter an agreed price between RM0.01 and RM10,000.');
  end if;
  if p_payment_mode is null or p_payment_mode not in ('deposit', 'pickup', 'postage') then
    return jsonb_build_object('success', false, 'error', 'Invalid service option.');
  end if;
  if p_payment_mode = 'deposit' and (p_deposit_method is null or p_deposit_method not in ('pickup', 'postage')) then
    return jsonb_build_object('success', false, 'error', 'Choose the deposit fulfilment method.');
  end if;
  select count(*) into v_recent_count from public.jubah_custom_quotes
  where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then
    return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.');
  end if;

  insert into public.jubah_custom_quotes (
    token_hash, ic_hash, agreed_price, customer_phone, payment_mode, deposit_method, created_by
  ) values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_ic, 'sha256'), 'hex'),
    v_price,
    p_customer_phone,
    p_payment_mode,
    case when p_payment_mode = 'deposit' then p_deposit_method else null end,
    auth.uid()
  );
  return jsonb_build_object('success', true, 'token', v_token, 'expires_at', now() + interval '48 hours');
exception when others then
  raise warning 'create_jubah_custom_quote failed [%]: %', sqlstate, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not create the quote. Please try again.');
end;
$$;

revoke all on function public.create_jubah_custom_quote(text, numeric, text, text, text) from public, anon;
grant execute on function public.create_jubah_custom_quote(text, numeric, text, text, text) to authenticated;

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
      and method = case when v_quote.payment_mode = 'deposit' then v_quote.deposit_method else v_quote.payment_mode end
    order by created_at limit 1;

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'customer_phone', v_quote.customer_phone,
    'rider_id', v_quote.created_by,
    'rider_name', v_rider_name,
    'campus', v_campus,
    'payment_mode', v_quote.payment_mode,
    'deposit_method', v_quote.deposit_method,
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
      and method = case when v_quote.payment_mode = 'deposit' then v_quote.deposit_method else v_quote.payment_mode end
    order by created_at limit 1;

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'customer_phone', v_quote.customer_phone,
    'rider_id', v_quote.created_by,
    'rider_name', v_rider_name,
    'campus', v_campus,
    'payment_mode', v_quote.payment_mode,
    'deposit_method', v_quote.deposit_method,
    'expires_at', v_quote.expires_at
  );
end;
$$;
