-- ============================================================
-- Migration: University-scoped Jubah admin panel
-- Persists university_key onto jubah_bookings (previously only a
-- pricing-lookup parameter, never stored on the row — the admin panel had
-- to fragile-parse the free-text `university` column to group by
-- university at all), widens the campus CHECK constraint so non-UMPSA
-- campus values (UKM, UiTM, UMK, UIAM — each university's own single
-- "campus") can actually be inserted, and seeds UKM's 3 document fields.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_bookings ADD COLUMN IF NOT EXISTS university_key text;

-- Backfill: every booking ever created so far is UMPSA (the only
-- university whose booking form has ever been live).
UPDATE public.jubah_bookings SET university_key = 'umpsa' WHERE university_key IS NULL;

ALTER TABLE public.jubah_bookings ALTER COLUMN university_key SET NOT NULL;
ALTER TABLE public.jubah_bookings ALTER COLUMN university_key SET DEFAULT 'umpsa';

-- CHECK constraints have no "ADD IF NOT EXISTS" — guard manually so this
-- whole script is safe to re-run (e.g. after an unrelated later statement
-- failed partway through a previous attempt).
DO $$ BEGIN
  ALTER TABLE public.jubah_bookings ADD CONSTRAINT jubah_bookings_university_key_check
    CHECK (university_key = ANY (ARRAY['umpsa', 'uitm', 'umk', 'ukm', 'uiam']::text[]));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.jubah_bookings DROP CONSTRAINT IF EXISTS jubah_bookings_campus_check;
ALTER TABLE public.jubah_bookings ADD CONSTRAINT jubah_bookings_campus_check
  CHECK (campus = ANY (ARRAY['Pekan', 'Gambang', 'UiTM', 'UMK', 'UKM', 'UIAM']::text[]));

-- create_jubah_booking now persists p_university_key onto the new column —
-- everything else (validation, rate limiting, pricing lookup, generic
-- error handling) is unchanged from the live version.
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
  if p_university_key is null or p_university_key not in ('umpsa', 'uitm', 'umk', 'ukm', 'uiam') then
    return jsonb_build_object('success', false, 'error', 'Invalid university.');
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
    university, university_key, campus, faculty, remark,
    payment_mode, cost, balance_due, status,
    rider_id, rider_name, delivery_address,
    docs_path, payment_path,
    oscar_path, skpg_path, konvo_path, ic_path,
    customer_id, email
  ) values (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_university_key, p_campus, p_faculty, p_remark,
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

-- Seed UKM's document fields (Pengesahan Slip Kehadiran Konvokesyen, SKPG,
-- IC front & back) — reusing 'konvo'/'skpg'/'ic' as field_keys (not new
-- ones) since they map to the same jubah_bookings columns UMPSA's fields
-- already use (konvo_path/skpg_path/ic_path); UKM has no 'oscar' field.
-- No unique constraint exists on (university_key, field_key) to hang an
-- ON CONFLICT off of, so guarding re-runs with an explicit existence check.
INSERT INTO public.jubah_doc_fields (university_key, field_key, label, hint, position)
SELECT * FROM (VALUES
  ('ukm', 'konvo', 'Pengesahan Slip Kehadiran Konvokesyen', null::text, 1),
  ('ukm', 'skpg',  'SKPG',                                  null::text, 2),
  ('ukm', 'ic',    'IC (Front & Back)',                      'Accepts PDF or image (JPG/PNG)', 3)
) AS seed(university_key, field_key, label, hint, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.jubah_doc_fields d
  WHERE d.university_key = seed.university_key AND d.field_key = seed.field_key
);
