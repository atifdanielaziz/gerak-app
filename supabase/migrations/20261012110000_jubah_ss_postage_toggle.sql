-- ============================================================
-- Migration: Superadmin can close Jubah postage to Sabah & Sarawak
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Same idea as jubah_deposit_open (20261011100000): app_settings
-- 'jubah_ss_postage_open' ('true'/'false'; missing = open), public read so
-- the booking form can grey the SS choice out, written only through the
-- superadmin RPC. create_jubah_booking refuses SS while it's closed, so a
-- stale form can't get through. Existing SS bookings are untouched.

insert into public.app_settings (key, value) values ('jubah_ss_postage_open', 'true')
on conflict (key) do nothing;

create or replace function public.jubah_ss_postage_is_open()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select value from public.app_settings where key = 'jubah_ss_postage_open'), 'true') <> 'false';
$$;

-- Same NULL-role hole in the deposit switch from 20261011100000.
create or replace function public.set_jubah_deposit_open(p_open boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if coalesce(get_my_role(), '') <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  insert into public.app_settings (key, value) values ('jubah_deposit_open', case when p_open then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('success', true, 'open', p_open);
end;
$$;

create or replace function public.set_jubah_ss_postage_open(p_open boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  -- coalesce: get_my_role() is NULL for a user with no profile row, and
  -- NULL <> 'superadmin' would otherwise let them through.
  if coalesce(get_my_role(), '') <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  insert into public.app_settings (key, value) values ('jubah_ss_postage_open', case when p_open then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('success', true, 'open', p_open);
end;
$$;
revoke all on function public.set_jubah_ss_postage_open(boolean) from public, anon;
grant execute on function public.set_jubah_ss_postage_open(boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.create_jubah_booking(p_reference text, p_full_name text, p_ic_number text, p_hp_number text, p_matric_id text, p_university text, p_campus text, p_faculty text, p_remark text, p_payment_mode text, p_deposit_method text DEFAULT NULL::text, p_postage_zone text DEFAULT NULL::text, p_rider_id text DEFAULT NULL::text, p_rider_name text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text, p_docs_path text DEFAULT NULL::text, p_payment_path text DEFAULT NULL::text, p_oscar_path text DEFAULT NULL::text, p_skpg_path text DEFAULT NULL::text, p_konvo_path text DEFAULT NULL::text, p_ic_path text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid, p_university_key text DEFAULT 'umpsa'::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_recent_count integer;
  v_pickup_price numeric;
  v_postage_price numeric;
  v_ss_charge numeric := 0;
  v_cost numeric;
  v_balance_due numeric := 0;
  v_deposit_amount numeric := 25;
  v_target_price numeric;
  v_rider_id uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0 or length(p_full_name) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid full name.');
  end if;
  if p_ic_number is null or p_ic_number !~ '^[0-9-]{8,14}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid IC number.');
  end if;
  if p_hp_number is null or p_hp_number !~ '^[0-9-]{8,15}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid phone number.');
  end if;
  if p_matric_id is null or length(trim(p_matric_id)) = 0 or length(p_matric_id) > 30 then
    return jsonb_build_object('success', false, 'error', 'Invalid matric ID.');
  end if;

  -- New: a matric ID already on file under a different IC number is
  -- rejected outright, rather than silently accepted as another row.
  if exists (
    select 1 from public.jubah_bookings
    where upper(matric_id) = upper(p_matric_id)
      and ic_number <> p_ic_number
  ) then
    return jsonb_build_object('success', false, 'error', 'This Matric ID is already registered under a different IC number. Please double-check your Matric ID and IC number.');
  end if;

  if p_university is null or length(p_university) = 0 or length(p_university) > 150 then
    return jsonb_build_object('success', false, 'error', 'Invalid university.');
  end if;
  if p_campus is null or length(p_campus) = 0 or length(p_campus) > 50 then
    return jsonb_build_object('success', false, 'error', 'Invalid campus.');
  end if;
  if p_faculty is null or length(trim(p_faculty)) = 0 or length(p_faculty) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid faculty.');
  end if;
  if p_remark is null or length(trim(p_remark)) = 0 or length(p_remark) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid robe type.');
  end if;
  if p_email is not null and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('success', false, 'error', 'Invalid email address.');
  end if;
  if p_email is not null and length(p_email) > 254 then
    return jsonb_build_object('success', false, 'error', 'Invalid email address.');
  end if;
  if p_delivery_address is not null and length(p_delivery_address) > 500 then
    return jsonb_build_object('success', false, 'error', 'Delivery address too long.');
  end if;
  if p_university_key is null or p_university_key not in ('umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza', 'utp', 'upm', 'um', 'upsi', 'ums', 'unimas') then
    return jsonb_build_object('success', false, 'error', 'Invalid university.');
  end if;

  select count(*) into v_recent_count from public.jubah_bookings
  where created_at > now() - interval '10 minutes'
    and (hp_number = p_hp_number or matric_id = p_matric_id);
  if v_recent_count >= 3 then
    return jsonb_build_object('success', false, 'error', 'Too many bookings from this number, please wait a few minutes.');
  end if;

  begin v_rider_id := nullif(p_rider_id, '')::uuid; exception when others then v_rider_id := null; end;
  if v_rider_id is not null and public.jubah_rider_order_count(v_rider_id, p_university_key) >= public.jubah_rider_order_cap() then
    return jsonb_build_object('success', false, 'error', 'This rider has reached their order limit for this university. Please select another rider.');
  end if;

  select price into v_pickup_price from public.jubah_pricing
  where remark = p_remark and payment_mode = 'pickup' and university = p_university_key;
  select price into v_postage_price from public.jubah_pricing
  where remark = p_remark and payment_mode = 'postage' and university = p_university_key;
  if v_pickup_price is null or v_postage_price is null then
    return jsonb_build_object('success', false, 'error', 'Pricing not configured for this option.');
  end if;

  select coalesce(nullif(value, '')::numeric, 25) into v_deposit_amount
  from public.app_settings where key = 'jubah_deposit_amount';
  v_deposit_amount := coalesce(v_deposit_amount, 25);
  -- Sabah & Sarawak has its own price per study level (postage_ss row);
  -- falls back to the old flat +RM10 if that row isn't set for a university.
  if p_postage_zone = 'SS' and not public.jubah_ss_postage_is_open() then
    return jsonb_build_object('success', false, 'error', 'Postage to Sabah & Sarawak is closed for now.');
  end if;
  if p_postage_zone = 'SS' then
    select price - v_postage_price into v_ss_charge from public.jubah_pricing
    where remark = p_remark and payment_mode = 'postage_ss' and university = p_university_key;
    v_ss_charge := coalesce(v_ss_charge, 10);
  end if;

  if p_payment_mode = 'deposit' then
    v_target_price := case when p_deposit_method = 'postage' then v_postage_price + v_ss_charge else v_pickup_price end;
    if v_deposit_amount > v_target_price then
      return jsonb_build_object('success', false, 'error', 'The configured deposit exceeds this booking price. Please contact admin.');
    end if;
    v_cost := v_deposit_amount;
    v_balance_due := v_target_price - v_deposit_amount;
  elsif p_payment_mode = 'postage' then
    v_cost := v_postage_price + v_ss_charge;
  elsif p_payment_mode = 'pickup' then
    v_cost := v_pickup_price;
  else
    return jsonb_build_object('success', false, 'error', 'Invalid payment mode.');
  end if;

  insert into public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id,
    university, university_key, campus, faculty, remark,
    payment_mode, cost, balance_due, status,
    rider_id, rider_name, delivery_address,
    docs_path, payment_path, oscar_path, skpg_path, konvo_path, ic_path,
    customer_id, email
  ) values (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_university_key, p_campus, p_faculty, p_remark,
    p_payment_mode, v_cost, v_balance_due, 'ordered',
    v_rider_id, p_rider_name, p_delivery_address,
    p_docs_path, p_payment_path, p_oscar_path, p_skpg_path, p_konvo_path, p_ic_path,
    p_customer_id, p_email
  );
  return jsonb_build_object('success', true, 'reference', p_reference, 'cost', v_cost, 'balance_due', v_balance_due);
exception when others then
  raise warning 'create_jubah_booking failed: % (sqlstate %)', sqlerrm, sqlstate;
  if sqlstate = '23505' then
    return jsonb_build_object('success', false, 'error', 'This reference number is already in use — please try again.', 'code', 'duplicate_reference');
  end if;
  return jsonb_build_object('success', false, 'error', 'Something went wrong saving your booking. Please try again, or contact admin if this keeps happening.');
end;
$function$;
