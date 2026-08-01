-- ============================================================
-- Surface per-rider bank details to guests + gate rider selectability on
-- having them set. Depends on migration_jubah_rider_bank_details.sql.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1) get_active_jubah_riders — powers the customer "Select Rider" dropdown.
--    A rider with an active assignment but no bank details on file simply
--    won't appear here anymore (same enforcement point as every other
--    selectability rule already in this query — role/can_robe/status).
--    Also now returns the three bank fields so the booking form can render
--    the selected rider's bank details straight from this already-fetched
--    list, no extra round trip. Return shape changed, so DROP is required
--    (mirrors migration_jubah_mask_ic.sql's own DROP + CREATE for the same
--    function, last touched there).
drop function if exists public.get_active_jubah_riders(text, text);
create or replace function public.get_active_jubah_riders(p_campus text, p_method text)
returns table (
  id uuid, name text, jubah_drop_point text, ic_number text, phone text,
  jubah_bank_name text, jubah_bank_account_number text, jubah_bank_account_holder text
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select
    p.id,
    p.name,
    ja.drop_point as jubah_drop_point,
    case
      when p.ic_number is null then null
      when length(regexp_replace(p.ic_number, '\D', '', 'g')) < 6 then null
      else substring(regexp_replace(p.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
    end as ic_number,
    p.phone,
    p.jubah_bank_name,
    p.jubah_bank_account_number,
    p.jubah_bank_account_holder
  from public.jubah_rider_assignments ja
  join public.profiles p on p.id = ja.rider_id
  where ja.campus    = p_campus
    and ja.method    = p_method
    and ja.is_active = true
    and p.role       = 'rider'
    and p.can_robe   = true
    and p.status     = 'active'
    and btrim(coalesce(p.jubah_bank_name, ''))           <> ''
    and btrim(coalesce(p.jubah_bank_account_number, '')) <> ''
    and btrim(coalesce(p.jubah_bank_account_holder, '')) <> ''
  order by p.name;
$$;

grant execute on function public.get_active_jubah_riders(text, text) to anon, authenticated;

-- 2) create_jubah_booking — snapshots the assigned rider's CURRENT bank
--    details onto the booking row at insert time, looked up server-side
--    from p_rider_id (never accepted as a client param) so a tampered
--    request can't redirect a customer's payment to a different account.
--    Signature/return type unchanged, so CREATE OR REPLACE is safe.
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
    where id = nullif(p_rider_id, '')::uuid;
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

-- 3) track_jubah_booking — surfaces the booking's own rider_id (needed by
--    TrackJubah.tsx to render the assigned rider's QR code) and the
--    persisted bank snapshot, so a returning customer sees the exact same
--    payment details they were originally shown, not a live/possibly-since-
--    changed lookup. Return shape changed, so DROP is required (this
--    function was last redefined in migration_jubah_rate_limit_consolidate.sql).
drop function if exists public.track_jubah_booking(text, text, text, text);
create or replace function public.track_jubah_booking(p_reference text default null, p_hp_number text default null, p_matric_id text default null, p_ic_number text default null)
returns table(
  id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text,
  status text, payment_mode text, rider_id uuid, rider_name text, rider_phone text,
  balance_due numeric, balance_paid boolean, balance_proof_url text,
  rider_bank_name text, rider_bank_account_number text, rider_bank_account_holder text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

  return query
  select jb.id, jb.reference, jb.full_name, jb.hp_number, jb.campus, jb.faculty, jb.remark,
         jb.status, jb.payment_mode, jb.rider_id, jb.rider_name, p.phone as rider_phone,
         jb.balance_due, jb.balance_paid, jb.balance_proof_url,
         jb.rider_bank_name, jb.rider_bank_account_number, jb.rider_bank_account_holder
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where
    (p_reference  is not null and jb.reference = p_reference) or
    (p_hp_number  is not null and jb.hp_number = p_hp_number) or
    (p_matric_id  is not null and lower(jb.matric_id) = lower(p_matric_id)) or
    (p_ic_number  is not null and replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$$;

grant execute on function public.track_jubah_booking(text, text, text, text) to anon, authenticated;
