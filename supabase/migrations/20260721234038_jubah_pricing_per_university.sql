-- ============================================================
-- Migration: Per-university Jubah pricing
-- jubah_pricing was a single global matrix (remark x payment_mode) shared
-- by every university. Adds a university column so admin can configure
-- separate pricing per university ahead of non-UMPSA universities going
-- live, and updates create_jubah_booking's server-side price lookup to
-- actually charge based on the booking's own university — otherwise a
-- per-university admin UI would be cosmetic only, since price-trust
-- (migration_jubah_booking_price_trust.sql) computes the real charge
-- server-side regardless of what the admin UI displays.
--
-- Keyed by the same short university key already used to gate which
-- university's booking form is live (umpsa/uitm/umk/ukm/uiam) — NOT the
-- verbose campus display string stored in jubah_bookings.university
-- (e.g. "Universiti Malaysia Pahang Al-Sultan Abdullah (Pekan)"), since
-- that string varies by campus within a university and isn't a stable
-- lookup key. create_jubah_booking gets a new p_university_key parameter
-- for this — p_university itself is untouched, still stores the verbose
-- display string as before.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_pricing
  ADD COLUMN IF NOT EXISTS university text NOT NULL DEFAULT 'umpsa';

ALTER TABLE public.jubah_pricing DROP CONSTRAINT IF EXISTS jubah_pricing_remark_payment_mode_key;
ALTER TABLE public.jubah_pricing
  ADD CONSTRAINT jubah_pricing_remark_payment_mode_university_key
  UNIQUE (remark, payment_mode, university);

-- Seed the same starting prices for the other universities (not yet live)
-- so their pricing isn't left unconfigured once their forms open.
INSERT INTO public.jubah_pricing (remark, payment_mode, price, university)
SELECT jp.remark, jp.payment_mode, jp.price, u.university
FROM public.jubah_pricing jp, (VALUES ('uitm'), ('umk'), ('ukm'), ('uiam')) AS u(university)
WHERE jp.university = 'umpsa'
ON CONFLICT (remark, payment_mode, university) DO NOTHING;

-- get_jubah_pricing: signature unchanged — still returns every row across
-- every university (data volume is tiny, ~40 rows); the admin UI's new
-- university dropdown filters client-side.

-- set_jubah_price: add p_university (default keeps old callers working)
DROP FUNCTION IF EXISTS public.set_jubah_price(text, text, numeric);
CREATE FUNCTION public.set_jubah_price(
  p_remark text,
  p_payment_mode text,
  p_price numeric,
  p_university text DEFAULT 'umpsa'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;
  UPDATE public.jubah_pricing
  SET price = p_price
  WHERE remark = p_remark AND payment_mode = p_payment_mode AND university = p_university;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_jubah_price(text, text, numeric, text) TO authenticated;

-- create_jubah_booking: new p_university_key param (default 'umpsa' keeps
-- old client builds working); price lookup now filters by it too — the
-- actual security-relevant fix.
CREATE OR REPLACE FUNCTION public.create_jubah_booking(
  p_reference        text,
  p_full_name        text,
  p_ic_number        text,
  p_hp_number        text,
  p_matric_id        text,
  p_university       text,
  p_campus           text,
  p_faculty          text,
  p_remark           text,
  p_payment_mode     text,
  p_deposit_method   text    DEFAULT NULL,
  p_postage_zone     text    DEFAULT NULL,
  p_rider_id         text    DEFAULT NULL,
  p_rider_name       text    DEFAULT NULL,
  p_delivery_address text    DEFAULT NULL,
  p_docs_path        text    DEFAULT NULL,
  p_payment_path     text    DEFAULT NULL,
  p_oscar_path       text    DEFAULT NULL,
  p_skpg_path        text    DEFAULT NULL,
  p_konvo_path       text    DEFAULT NULL,
  p_ic_path          text    DEFAULT NULL,
  p_customer_id      uuid    DEFAULT NULL,
  p_university_key   text    DEFAULT 'umpsa'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_recent_count  integer;
  v_pickup_price  numeric;
  v_postage_price numeric;
  v_ss_charge     numeric := 0;
  v_cost          numeric;
  v_balance_due   numeric := 0;
  v_deposit_amount CONSTANT numeric := 25;
BEGIN
  SELECT count(*) INTO v_recent_count
  FROM public.jubah_bookings
  WHERE created_at > now() - interval '10 minutes'
    AND (hp_number = p_hp_number OR matric_id = p_matric_id);

  IF v_recent_count >= 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Too many bookings from this number, please wait a few minutes.'
    );
  END IF;

  SELECT price INTO v_pickup_price  FROM public.jubah_pricing WHERE remark = p_remark AND payment_mode = 'pickup'  AND university = p_university_key;
  SELECT price INTO v_postage_price FROM public.jubah_pricing WHERE remark = p_remark AND payment_mode = 'postage' AND university = p_university_key;

  IF v_pickup_price IS NULL OR v_postage_price IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pricing not configured for this option.');
  END IF;

  IF p_postage_zone = 'SS' THEN
    v_ss_charge := 10;
  END IF;

  IF p_payment_mode = 'deposit' THEN
    v_cost := v_deposit_amount;
    IF p_deposit_method = 'postage' THEN
      v_balance_due := v_postage_price + v_ss_charge - v_deposit_amount;
    ELSE
      v_balance_due := v_pickup_price - v_deposit_amount;
    END IF;
  ELSIF p_payment_mode = 'postage' THEN
    v_cost := v_postage_price + v_ss_charge;
  ELSIF p_payment_mode = 'pickup' THEN
    v_cost := v_pickup_price;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payment mode.');
  END IF;

  INSERT INTO public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id,
    university, campus, faculty, remark,
    payment_mode, cost, balance_due,
    rider_id, rider_name, delivery_address,
    docs_path, payment_path,
    oscar_path, skpg_path, konvo_path, ic_path,
    customer_id
  ) VALUES (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_campus, p_faculty, p_remark,
    p_payment_mode, v_cost, v_balance_due,
    NULLIF(p_rider_id, '')::uuid, p_rider_name, p_delivery_address,
    p_docs_path, p_payment_path,
    p_oscar_path, p_skpg_path, p_konvo_path, p_ic_path,
    p_customer_id
  );
  RETURN jsonb_build_object('success', true, 'reference', p_reference, 'cost', v_cost, 'balance_due', v_balance_due);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_jubah_booking(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, text, uuid, text
) TO anon, authenticated;
