-- ── Abuse protection for create_jubah_booking (guest-open RPC) ──────────────
-- The function is intentionally callable by anon (guest bookings), but had
-- no rate limiting: a script could generate a new unique reference per call
-- and insert unlimited fake rows. This throttles by phone/matric — both are
-- required fields on every legitimate booking and already stored on
-- jubah_bookings, so no new table or cleanup job is needed.

CREATE INDEX IF NOT EXISTS idx_jubah_bookings_matric ON public.jubah_bookings (matric_id);

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
  p_cost             numeric,
  p_balance_due      numeric DEFAULT 0,
  p_rider_id         text   DEFAULT NULL,
  p_rider_name       text   DEFAULT NULL,
  p_delivery_address text   DEFAULT NULL,
  p_drive_docs_url   text   DEFAULT NULL,
  p_drive_payment_url text  DEFAULT NULL,
  p_drive_oscar_url  text   DEFAULT NULL,
  p_drive_skpg_url   text   DEFAULT NULL,
  p_drive_konvo_url  text   DEFAULT NULL,
  p_drive_ic_url     text   DEFAULT NULL,
  p_customer_id      uuid   DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_recent_count integer;
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

  INSERT INTO public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id,
    university, campus, faculty, remark,
    payment_mode, cost, balance_due,
    rider_id, rider_name, delivery_address,
    drive_docs_url, drive_payment_url,
    drive_oscar_url, drive_skpg_url, drive_konvo_url, drive_ic_url,
    customer_id
  ) VALUES (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_campus, p_faculty, p_remark,
    p_payment_mode, p_cost, p_balance_due,
    NULLIF(p_rider_id, '')::uuid, p_rider_name, p_delivery_address,
    p_drive_docs_url, p_drive_payment_url,
    p_drive_oscar_url, p_drive_skpg_url, p_drive_konvo_url, p_drive_ic_url,
    p_customer_id
  );
  RETURN jsonb_build_object('success', true, 'reference', p_reference);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_jubah_booking(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text, text, text, text, text, uuid
) TO anon, authenticated;
