-- Rename jubah_bookings columns: drop the "drive_" prefix and "_url" suffix
-- Values were always Supabase Storage paths, never Google Drive URLs.

ALTER TABLE public.jubah_bookings RENAME COLUMN drive_docs_url    TO docs_path;
ALTER TABLE public.jubah_bookings RENAME COLUMN drive_payment_url TO payment_path;
ALTER TABLE public.jubah_bookings RENAME COLUMN drive_oscar_url   TO oscar_path;
ALTER TABLE public.jubah_bookings RENAME COLUMN drive_skpg_url    TO skpg_path;
ALTER TABLE public.jubah_bookings RENAME COLUMN drive_konvo_url   TO konvo_path;
ALTER TABLE public.jubah_bookings RENAME COLUMN drive_ic_url      TO ic_path;

-- Drop old function signature so we can rename its parameters too
DROP FUNCTION IF EXISTS public.create_jubah_booking(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, text, text, text, text, text, text, text, text, uuid
);

-- Recreate with clean parameter names + throttle guard (replaces both
-- migration_jubah_book_rpc.sql and migration_jubah_book_rpc_throttle.sql)
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
  p_cost             numeric,
  p_balance_due      numeric DEFAULT 0,
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
    docs_path, payment_path,
    oscar_path, skpg_path, konvo_path, ic_path,
    customer_id
  ) VALUES (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_campus, p_faculty, p_remark,
    p_payment_mode, p_cost, p_balance_due,
    NULLIF(p_rider_id, '')::uuid, p_rider_name, p_delivery_address,
    p_docs_path, p_payment_path,
    p_oscar_path, p_skpg_path, p_konvo_path, p_ic_path,
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
