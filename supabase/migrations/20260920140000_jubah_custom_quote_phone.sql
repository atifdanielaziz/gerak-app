-- Bring customer_phone back into the custom quote itself (the column was
-- never dropped, just stopped being populated in 20260920090000) — the
-- runner now enters it once when creating the quote, it's saved with the
-- quote, and the customer's HP Number field is pre-filled with it once
-- they verify by IC. Still fully editable on the customer's side (no
-- disabled attribute was reintroduced) -- this is a convenience default,
-- not something enforced server-side beyond the usual HP format check
-- already in create_custom_jubah_booking.

drop function if exists public.create_jubah_custom_quote(text, numeric);

create or replace function public.create_jubah_custom_quote(
  p_ic_number text,
  p_agreed_price numeric,
  p_customer_phone text
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
  select count(*) into v_recent_count from public.jubah_custom_quotes
  where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then
    return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.');
  end if;

  insert into public.jubah_custom_quotes (token_hash, ic_hash, agreed_price, customer_phone, created_by)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_ic, 'sha256'), 'hex'),
    v_price,
    p_customer_phone,
    auth.uid()
  );
  return jsonb_build_object('success', true, 'token', v_token, 'expires_at', now() + interval '48 hours');
exception when others then
  raise warning 'create_jubah_custom_quote failed [%]: %', sqlstate, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not create the quote. Please try again.');
end;
$$;

revoke all on function public.create_jubah_custom_quote(text, numeric, text) from public, anon;
grant execute on function public.create_jubah_custom_quote(text, numeric, text) to authenticated;

create or replace function public.resolve_jubah_custom_quote(p_token text, p_ic_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_quote public.jubah_custom_quotes%rowtype;
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

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'customer_phone', v_quote.customer_phone,
    'expires_at', v_quote.expires_at
  );
end;
$$;
