-- ============================================================
-- Migration: Per-university rider commission + uum university-key gaps
-- Rider commission (jubah_rider_commission_amount_pickup/postage in
-- app_settings) was one flat rate shared by every university, unlike
-- jubah_pricing which already varies per university. Splits commission
-- into its own per-university table, mirroring jubah_pricing's exact
-- shape (table + get_/set_ RPC pair, admin UI's university dropdown
-- filters client-side).
--
-- Also fixes a pre-existing gap found while touching this same surface:
-- 'uum' was added to src/lib/universities.ts after the university-scoping
-- migration (20260802040000) shipped, but never added to the DB-side
-- allowlists there — a UUM Jubah booking would hard-fail
-- create_jubah_booking's own validation today, and UUM silently had zero
-- jubah_pricing rows (saving a price while the admin pricing matrix was
-- viewing UUM updated zero rows, no error surfaced, since UPDATE ... WHERE
-- matching nothing is not an error). Both fixed here since a UUM
-- Jubah booking would otherwise still be broken even with commission and
-- pricing now correctly wired to vary per university.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1) Per-university rider commission table, same shape as jubah_pricing.
CREATE TABLE IF NOT EXISTS public.jubah_rider_commission (
  delivery_type text    NOT NULL CHECK (delivery_type IN ('pickup', 'postage')),
  university    text    NOT NULL,
  amount        numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (delivery_type, university)
);

ALTER TABLE public.jubah_rider_commission ENABLE ROW LEVEL SECURITY;

-- Staff-only read (unlike jubah_pricing, customers never need this) —
-- update_jubah_booking_status itself is SECURITY DEFINER so it isn't
-- gated by this policy either way. CREATE POLICY has no IF NOT EXISTS, so
-- guard with DO/EXCEPTION (same pattern as 20260802040000's constraint
-- guard) — safe to re-run if an earlier attempt got this far already.
DO $$ BEGIN
  CREATE POLICY "jubah_rider_commission_read"
    ON public.jubah_rider_commission FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Defense-in-depth only — real writes go through
-- set_jubah_rider_commission_amount (SECURITY DEFINER, its own
-- superadmin check), same relationship jubah_pricing has with set_jubah_price.
DO $$ BEGIN
  CREATE POLICY "jubah_rider_commission_update"
    ON public.jubah_rider_commission FOR UPDATE
    TO authenticated
    USING (public.get_my_role() = 'superadmin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed every currently-known university with today's flat rate (falls back
-- to 25 if the old app_settings rows are somehow already gone) so nothing
-- reads as "unconfigured" the moment this ships.
INSERT INTO public.jubah_rider_commission (delivery_type, university, amount)
SELECT d.dt, u.uni, coalesce((
  SELECT value::numeric FROM public.app_settings
  WHERE key = 'jubah_rider_commission_amount_' || d.dt
), 25)
FROM (VALUES ('pickup'), ('postage')) AS d(dt),
     (VALUES ('umpsa'), ('uitm'), ('umk'), ('ukm'), ('uiam'), ('uum')) AS u(uni)
ON CONFLICT (delivery_type, university) DO NOTHING;

-- The two flat global keys are now superseded by the table above.
DELETE FROM public.app_settings
  WHERE key IN ('jubah_rider_commission_amount_pickup', 'jubah_rider_commission_amount_postage');

-- 2) set_jubah_rider_commission_amount: add p_university (default keeps old
-- callers working). Signature changed from the OLD 2-arg version — drop
-- that specific overload first, same trap as previous Jubah RPC renames
-- (CREATE OR REPLACE would leave a stale 2-arg overload live). The 3-arg
-- version itself uses CREATE OR REPLACE (not bare CREATE) so re-running
-- this migration after it already succeeded once doesn't collide with itself.
DROP FUNCTION IF EXISTS public.set_jubah_rider_commission_amount(numeric, text);

CREATE OR REPLACE FUNCTION public.set_jubah_rider_commission_amount(
  p_amount numeric, p_delivery_type text, p_university text DEFAULT 'umpsa'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() != 'superadmin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorised.');
  END IF;
  IF p_delivery_type NOT IN ('pickup', 'postage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid delivery type.');
  END IF;
  IF p_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Commission amount cannot be negative.');
  END IF;

  INSERT INTO public.jubah_rider_commission (delivery_type, university, amount)
    VALUES (p_delivery_type, p_university, p_amount)
    ON CONFLICT (delivery_type, university) DO UPDATE SET amount = excluded.amount;

  RETURN jsonb_build_object('success', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_jubah_rider_commission_amount(numeric, text, text) TO authenticated;

-- get_jubah_rider_commission(): returns every row across every university —
-- data volume is tiny (12 rows today), admin UI's university dropdown
-- filters client-side, same pattern as get_jubah_pricing().
CREATE OR REPLACE FUNCTION public.get_jubah_rider_commission()
RETURNS SETOF public.jubah_rider_commission
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT * FROM public.jubah_rider_commission ORDER BY delivery_type, university; $$;
GRANT EXECUTE ON FUNCTION public.get_jubah_rider_commission() TO authenticated;

-- 3) update_jubah_booking_status: commission lookup now scoped by the
-- booking's own university_key instead of one global rate for everyone.
-- Body otherwise unchanged from the live version (20260802023500).
create or replace function public.update_jubah_booking_status(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking      public.jubah_bookings;
  v_steps        text[];
  v_cur_idx      int;
  v_next         text;
  v_is_terminal  boolean := false;
  v_delivery_type text;
  v_amount       numeric;
begin
  select * into v_booking
  from public.jubah_bookings
  where id = p_booking_id
    and (rider_id = auth.uid() or public.get_my_role() in ('admin', 'superadmin'));

  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;

  if v_booking.status = 'ordered' then
    v_next := 'paid';
  else
    v_steps := case v_booking.payment_mode
      when 'deposit' then array['paid', 'processing', 'collected', 'delivered']
      when 'postage' then array['paid', 'processing', 'collected', 'at_hub']
      else                array['paid', 'processing', 'collected', 'delivered']
    end;

    v_cur_idx := array_position(v_steps, v_booking.status);
    if v_cur_idx is null or v_cur_idx = array_length(v_steps, 1) then
      return jsonb_build_object('success', false, 'error', 'This booking cannot be advanced further.');
    end if;
    v_next := v_steps[v_cur_idx + 1];
    v_is_terminal := (v_cur_idx + 1 = array_length(v_steps, 1));
  end if;

  if p_status <> v_next then
    return jsonb_build_object('success', false, 'error', 'Invalid status transition.');
  end if;

  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'paid' then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;

  if v_is_terminal and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    v_delivery_type := case when (v_booking.payment_mode = 'postage'
                                   or (v_booking.payment_mode = 'deposit' and v_booking.delivery_address is not null))
                        then 'postage' else 'pickup' end;

    select coalesce(amount, 0) into v_amount
    from public.jubah_rider_commission
    where delivery_type = v_delivery_type and university = v_booking.university_key;

    update public.jubah_bookings
       set status = p_status,
           rider_commission_rate      = null,
           rider_commission_amount    = coalesce(v_amount, 0),
           rider_commission_earned_at = now()
     where id = p_booking_id;
  else
    update public.jubah_bookings
       set status = p_status,
           initial_paid    = case when v_booking.status = 'ordered' then true else initial_paid end,
           initial_paid_at = case when v_booking.status = 'ordered' then now() else initial_paid_at end
     where id = p_booking_id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.update_jubah_booking_status(uuid, text) to authenticated;

-- 4) Fix pre-existing 'uum' gap — widen the university_key allowlist and
-- seed its pricing rows, mirroring exactly how uitm/umk/ukm/uiam were
-- seeded in 20260721234038_jubah_pricing_per_university.sql.
ALTER TABLE public.jubah_bookings DROP CONSTRAINT IF EXISTS jubah_bookings_university_key_check;
ALTER TABLE public.jubah_bookings ADD CONSTRAINT jubah_bookings_university_key_check
  CHECK (university_key = ANY (ARRAY['umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum']::text[]));

-- Separately, a genuinely live bug found while touching this exact
-- constraint: jubah_bookings_campus_check (added 20260802040000) only
-- allows each non-UMPSA university's own short label ('UKM', 'UiTM', ...)
-- as its "campus" value — a placeholder from when every non-UMPSA
-- university had a single fake campus equal to its own name. Real
-- per-university campus lists were added 2026-08-04
-- (src/lib/universities.ts), and Jubah.tsx's booking submission has sent
-- deriveJubahCampus()'s REAL campus name ever since (e.g. 'Bangi' for
-- UKM, not 'UKM') — meaning any UKM booking (UKM is university live:true)
-- has been silently failing this CHECK constraint since 2026-08-04.
-- Widened additively (old placeholders kept, not replaced) so this ALTER
-- can't fail even if a pre-2026-08-04 row still has the old placeholder
-- value on it.
ALTER TABLE public.jubah_bookings DROP CONSTRAINT IF EXISTS jubah_bookings_campus_check;
ALTER TABLE public.jubah_bookings ADD CONSTRAINT jubah_bookings_campus_check
  CHECK (campus = ANY (ARRAY[
    'Pekan', 'Gambang',
    'UiTM', 'Shah Alam', 'Puncak Alam', 'Machang',
    'UMK', 'Jeli', 'Bachok', 'Kota Bharu',
    'UKM', 'Bangi',
    'UIAM', 'Gombak', 'Kuantan',
    'UUM', 'Sintok'
  ]::text[]));

INSERT INTO public.jubah_pricing (remark, payment_mode, price, university)
SELECT jp.remark, jp.payment_mode, jp.price, 'uum'
FROM public.jubah_pricing jp
WHERE jp.university = 'umpsa'
ON CONFLICT (remark, payment_mode, university) DO NOTHING;

-- create_jubah_booking: identical body to the live version
-- (20260802040000_jubah_university_scoping.sql), only the p_university_key
-- allowlist widened to include 'uum'.
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
  if p_university_key is null or p_university_key not in ('umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum') then
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
