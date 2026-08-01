-- ============================================================
-- Revert Jubah bank details + payment QR from per-rider back to a
-- single shared, superadmin-controlled account.
-- ============================================================
--
-- Product decision: money was landing directly in each rider's own bank
-- account with no enforced way to get the platform's share back — only a
-- manual "needs_reconciliation" flag, pure trust. Reverting to one
-- superadmin-set account (set_jubah_bank_details, already exists and is
-- untouched — see migration_jubah_bank_details_rpc.sql) restores a single
-- controlled collection point.
--
-- The per-rider columns (profiles.jubah_bank_*, jubah_bookings.rider_bank_*)
-- and the set_rider_bank_details RPC are deliberately left in place, unused
-- — same lower-risk convention used when the shared account was first
-- superseded by this per-rider feature.

-- 1) get_active_jubah_riders — drop the "must have bank details" gate and
--    stop returning per-rider bank fields; eligibility no longer depends
--    on a rider having entered bank details of their own.
drop function if exists public.get_active_jubah_riders(text, text);
create or replace function public.get_active_jubah_riders(p_campus text, p_method text)
returns table (
  id uuid, name text, jubah_drop_point text, ic_number text, phone text
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
    p.phone
  from public.jubah_rider_assignments ja
  join public.profiles p on p.id = ja.rider_id
  where ja.campus    = p_campus
    and ja.method    = p_method
    and ja.is_active = true
    and p.role       = 'rider'
    and p.can_robe   = true
    and p.status     = 'active'
  order by p.name;
$$;

grant execute on function public.get_active_jubah_riders(text, text) to anon, authenticated;

-- 2) create_jubah_booking — drop the per-rider bank lookup/eligibility
--    check and stop snapshotting rider bank fields onto the booking.
--    Everything else (validation, rate limiting, generic error handling,
--    duplicate_reference code) is unchanged.
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

  insert into public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id,
    university, campus, faculty, remark,
    payment_mode, cost, balance_due, status,
    rider_id, rider_name, delivery_address,
    docs_path, payment_path,
    oscar_path, skpg_path, konvo_path, ic_path,
    customer_id, email
  ) values (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_campus, p_faculty, p_remark,
    p_payment_mode, v_cost, v_balance_due, 'ordered',
    nullif(p_rider_id, '')::uuid, p_rider_name, p_delivery_address,
    p_docs_path, p_payment_path,
    p_oscar_path, p_skpg_path, p_konvo_path, p_ic_path,
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
$$;

-- 3) track_jubah_booking — stop returning the per-rider bank snapshot.
drop function if exists public.track_jubah_booking(text, text, text, text);
create or replace function public.track_jubah_booking(p_reference text default null, p_hp_number text default null, p_matric_id text default null, p_ic_number text default null)
returns table(
  id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text,
  status text, payment_mode text, rider_id uuid, rider_name text, rider_phone text,
  balance_due numeric, balance_paid boolean, balance_proof_url text
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
         jb.balance_due, jb.balance_paid, jb.balance_proof_url
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

-- 4) Payment QR — revert storage RLS from "owner or superadmin" back to
--    superadmin-only. Public read is unchanged.
drop policy if exists "jubah_qr_owner_insert" on storage.objects;
create policy "jubah_qr_superadmin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin');

drop policy if exists "jubah_qr_owner_update" on storage.objects;
create policy "jubah_qr_superadmin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin')
  with check (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin');

drop policy if exists "jubah_qr_owner_delete" on storage.objects;
create policy "jubah_qr_superadmin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin');
