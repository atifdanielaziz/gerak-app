-- ============================================================
-- create_jubah_booking: validate the rider server-side, don't just trust it
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Found live: a booking (JUB-26-UMPSA-PXNU) got created with rider_id set
-- to a rider who has no bank details on file, because a stale client-side
-- rider list (fetched before migration_jubah_riders_bank_filter.sql was
-- applied, or just a browser tab left open) still offered them as an
-- option — create_jubah_booking did a blind lookup of whatever p_rider_id
-- it was given, with no check that this rider is actually still eligible
-- (role/can_robe/status/complete bank details) at the moment of insert.
-- The result: a real booking with nothing in "How to Pay" for the customer
-- to act on, permanently (the snapshot never re-syncs after insert).
--
-- Now re-validates the rider the same way get_active_jubah_riders does
-- before accepting the booking, and rejects with a clear error instead of
-- silently creating one with blank payment details. Signature/return type
-- unchanged, so CREATE OR REPLACE is safe.

create or replace function public.create_jubah_booking(
  p_reference text, p_full_name text, p_ic_number text, p_hp_number text, p_matric_id text,
  p_university text, p_campus text, p_faculty text, p_remark text, p_payment_mode text,
  p_deposit_method text default null, p_postage_zone text default null,
  p_rider_id text default null, p_rider_name text default null, p_delivery_address text default null,
  p_docs_path text default null, p_payment_path text default null,
  p_oscar_path text default null, p_skpg_path text default null, p_konvo_path text default null,
  p_ic_path text default null, p_customer_id uuid default null,
  p_university_key text default 'umpsa', p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recent_count  integer;
  v_pickup_price  numeric;
  v_postage_price numeric;
  v_ss_charge     numeric := 0;
  v_cost          numeric;
  v_balance_due   numeric := 0;
  v_deposit_amount constant numeric := 25;
  v_rider_bank_name           text;
  v_rider_bank_account_number text;
  v_rider_bank_account_holder text;
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

  select count(*) into v_recent_count
  from public.jubah_bookings
  where created_at > now() - interval '10 minutes'
    and (hp_number = p_hp_number or matric_id = p_matric_id);

  if v_recent_count >= 3 then
    return jsonb_build_object(
      'success', false,
      'error', 'Too many bookings from this number, please wait a few minutes.'
    );
  end if;

  select price into v_pickup_price  from public.jubah_pricing where remark = p_remark and payment_mode = 'pickup'  and university = p_university_key;
  select price into v_postage_price from public.jubah_pricing where remark = p_remark and payment_mode = 'postage' and university = p_university_key;

  if v_pickup_price is null or v_postage_price is null then
    return jsonb_build_object('success', false, 'error', 'Pricing not configured for this option.');
  end if;

  if p_postage_zone = 'SS' then
    v_ss_charge := 10;
  end if;

  if p_payment_mode = 'deposit' then
    v_cost := v_deposit_amount;
    if p_deposit_method = 'postage' then
      v_balance_due := v_postage_price + v_ss_charge - v_deposit_amount;
    else
      v_balance_due := v_pickup_price - v_deposit_amount;
    end if;
  elsif p_payment_mode = 'postage' then
    v_cost := v_postage_price + v_ss_charge;
  elsif p_payment_mode = 'pickup' then
    v_cost := v_pickup_price;
  else
    return jsonb_build_object('success', false, 'error', 'Invalid payment mode.');
  end if;

  if nullif(p_rider_id, '') is not null then
    select jubah_bank_name, jubah_bank_account_number, jubah_bank_account_holder
    into v_rider_bank_name, v_rider_bank_account_number, v_rider_bank_account_holder
    from public.profiles
    where id = nullif(p_rider_id, '')::uuid
      and role = 'rider' and can_robe = true and status = 'active';

    if v_rider_bank_name is null or btrim(v_rider_bank_name) = ''
       or v_rider_bank_account_number is null or btrim(v_rider_bank_account_number) = ''
       or v_rider_bank_account_holder is null or btrim(v_rider_bank_account_holder) = '' then
      return jsonb_build_object('success', false, 'error', 'Selected rider is no longer available. Please refresh and choose another rider.');
    end if;
  end if;

  insert into public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id,
    university, campus, faculty, remark,
    payment_mode, cost, balance_due, status,
    rider_id, rider_name, delivery_address,
    rider_bank_name, rider_bank_account_number, rider_bank_account_holder,
    docs_path, payment_path,
    oscar_path, skpg_path, konvo_path, ic_path,
    customer_id, email
  ) values (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_campus, p_faculty, p_remark,
    p_payment_mode, v_cost, v_balance_due, 'ordered',
    nullif(p_rider_id, '')::uuid, p_rider_name, p_delivery_address,
    v_rider_bank_name, v_rider_bank_account_number, v_rider_bank_account_holder,
    p_docs_path, p_payment_path,
    p_oscar_path, p_skpg_path, p_konvo_path, p_ic_path,
    p_customer_id, p_email
  );
  return jsonb_build_object('success', true, 'reference', p_reference, 'cost', v_cost, 'balance_due', v_balance_due);
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;
