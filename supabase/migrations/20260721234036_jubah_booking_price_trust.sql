-- ============================================================
-- Migration: Stop trusting client-supplied price on Jubah bookings
-- create_jubah_booking took p_cost/p_balance_due as plain parameters and
-- inserted them as-is — anyone calling the (anon-callable) RPC directly
-- could set any price they liked. Before ToyyibPay this was low-risk since
-- an admin eyeballed the payment proof and price before confirming; now
-- that payment confirmation is fully automated (via ToyyibPay's callback),
-- a tampered price would get silently auto-confirmed as "paid in full."
--
-- This recomputes cost/balance_due server-side from jubah_pricing, the
-- same table the frontend already reads for display. The RM25 deposit
-- amount isn't in that table (it's a flat amount regardless of remark) so
-- it's kept as a SQL constant here — mirrors DEPOSIT_AMOUNT in Jubah.tsx;
-- if that ever changes, update both.
--
-- p_cost/p_balance_due are removed from the signature entirely — the RPC
-- now returns the authoritative computed cost/balance_due in its response
-- so the frontend can display exactly what was actually charged, not just
-- assume its own pre-booking estimate matched.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

DROP FUNCTION IF EXISTS public.create_jubah_booking(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text, text, text, text, text, uuid
);

CREATE FUNCTION public.create_jubah_booking(
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
  p_customer_id      uuid    DEFAULT NULL
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

  SELECT price INTO v_pickup_price  FROM public.jubah_pricing WHERE remark = p_remark AND payment_mode = 'pickup';
  SELECT price INTO v_postage_price FROM public.jubah_pricing WHERE remark = p_remark AND payment_mode = 'postage';

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
  text, text, text, text, text, text, text, text, text, text, text, uuid
) TO anon, authenticated;
