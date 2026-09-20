-- create_jubah_custom_quote's own access gate was missed from the earlier
-- driver-can-also-robe parity pass (get_active_jubah_riders,
-- get_jubah_riders_directory_v2, set_rider_jubah_assignment,
-- create_custom_jubah_booking all already accept role='driver' with
-- can_robe=true) — confirmed live: a driver-role account demoted from
-- admin earlier this session, still can_robe=true and still a working
-- Jubah rider everywhere else, got "Runner access required." here only.

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
  v_can_robe boolean := coalesce((select can_robe from public.profiles where id = auth.uid()), false);
  v_token text := encode(extensions.gen_random_bytes(12), 'hex');
  v_ic text := regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g');
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_price numeric := round(p_agreed_price, 2);
  v_campus text := nullif(trim(coalesce(p_campus, '')), '');
  v_recent_count integer;
begin
  if auth.uid() is null or not (v_role in ('admin', 'superadmin') or v_can_robe) then
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
