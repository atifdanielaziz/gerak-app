-- Lets one rider serve more than one university (e.g. a UMPSA rider also
-- covering UKM), which jubah_rider_assignments already modeled correctly
-- (one row per campus+method) but three call sites assumed away:
--   1. create_jubah_custom_quote always resolved campus/method from
--      "whichever assignment row is oldest" — fine for a single-campus
--      rider, wrong the moment they have two. Now the rider picks which
--      campus a given quote is for, and that choice is stored on the quote
--      itself so resolution is unambiguous downstream.
--   2. resolve_jubah_custom_quote[_by_ic] mirror the same fix, reading the
--      stored campus when present and only falling back to "oldest
--      assignment" for quotes created before this migration.
-- (JubahRiderSubTab.tsx and JubahCustomQuoteSubTab.tsx carry the matching
-- frontend changes — this file is the data-layer half.)

alter table public.jubah_custom_quotes add column if not exists campus text;

drop function if exists public.create_jubah_custom_quote(text, numeric, text);

create or replace function public.create_jubah_custom_quote(
  p_ic_number text,
  p_agreed_price numeric,
  p_customer_phone text,
  p_campus text default null
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
  v_campus text := nullif(trim(coalesce(p_campus, '')), '');
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
  -- Only trust a campus this rider is actually assigned to — otherwise a
  -- quote could resolve to a campus/method the customer has no real rider
  -- for.
  if v_campus is not null and not exists (
    select 1 from public.jubah_rider_assignments
    where rider_id = auth.uid() and campus = v_campus and is_active = true
  ) then
    return jsonb_build_object('success', false, 'error', 'You are not assigned to that campus.');
  end if;
  select count(*) into v_recent_count from public.jubah_custom_quotes
  where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then
    return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.');
  end if;

  insert into public.jubah_custom_quotes (token_hash, ic_hash, agreed_price, customer_phone, campus, created_by)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_ic, 'sha256'), 'hex'),
    v_price,
    p_customer_phone,
    v_campus,
    auth.uid()
  );
  return jsonb_build_object('success', true, 'token', v_token, 'expires_at', now() + interval '48 hours');
exception when others then
  raise warning 'create_jubah_custom_quote failed [%]: %', sqlstate, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not create the quote. Please try again.');
end;
$$;

revoke all on function public.create_jubah_custom_quote(text, numeric, text, text) from public, anon;
grant execute on function public.create_jubah_custom_quote(text, numeric, text, text) to authenticated;

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
  if v_quote.campus is not null then
    v_campus := v_quote.campus;
    select method into v_method from public.jubah_rider_assignments
      where rider_id = v_quote.created_by and campus = v_quote.campus and is_active = true
      order by created_at limit 1;
  else
    -- Legacy quote, created before campus was captured — same
    -- "oldest assignment" guess as before this migration.
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
