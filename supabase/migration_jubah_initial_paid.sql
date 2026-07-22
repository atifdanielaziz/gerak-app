-- ============================================================
-- Migration: Track "was the initial payment actually confirmed" as its
-- own fact, not inferred from status
-- The receipt (buildJubahReceiptRows) inferred "paid" from `status !==
-- 'ordered'` — that broke the moment 'cancelled' became a real status,
-- since a booking cancelled while still unpaid also has status !=
-- 'ordered', producing a receipt that claimed "Deposit Paid" for money
-- that was never actually collected. Confirmed live: JUB-26-UMPSA-HYNU,
-- cancelled while still 'ordered', showed "Deposit Paid (22 Jul 2026)".
--
-- Fix: track it explicitly, the same way balance_paid/balance_paid_at
-- already do for the second payment — set once, true forever after,
-- survives any later status change including cancellation.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS initial_paid    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS initial_paid_at timestamptz;

-- update_jubah_booking_status: stamp initial_paid the moment a booking
-- first moves off 'ordered' (admin's manual "Confirm Payment" override —
-- the real ToyyibPay callback path is a separate function, updated
-- alongside this migration).
CREATE OR REPLACE FUNCTION public.update_jubah_booking_status(
  p_booking_id uuid,
  p_status     text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_booking public.jubah_bookings;
BEGIN
  SELECT * INTO v_booking
  FROM public.jubah_bookings
  WHERE id = p_booking_id
    AND (rider_id = auth.uid() OR public.get_my_role() IN ('admin','superadmin'));

  IF v_booking.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorised.');
  END IF;

  IF v_booking.payment_mode = 'deposit'
     AND NOT v_booking.balance_paid
     AND p_status <> 'booked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  END IF;

  UPDATE public.jubah_bookings
     SET status = p_status,
         initial_paid    = CASE WHEN v_booking.status = 'ordered' THEN true ELSE initial_paid END,
         initial_paid_at = CASE WHEN v_booking.status = 'ordered' THEN now() ELSE initial_paid_at END
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_jubah_booking_status(uuid, text) TO authenticated;

-- get_jubah_receipt: add initial_paid/initial_paid_at so the receipt can
-- finally tell "cancelled, never paid" apart from "cancelled after paying".
DROP FUNCTION IF EXISTS public.get_jubah_receipt(text, text);

CREATE FUNCTION public.get_jubah_receipt(
  p_reference text,
  p_ic_last4  text
) RETURNS TABLE (
  id uuid, reference text, full_name text, ic_number text, hp_number text,
  campus text, faculty text, university text, matric_id text,
  remark text, status text, payment_mode text, rider_name text, rider_phone text,
  cost numeric, balance_due numeric, balance_paid boolean, balance_paid_at timestamptz,
  initial_paid boolean, initial_paid_at timestamptz,
  delivery_address text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent_count integer;
BEGIN
  DELETE FROM public.jubah_tracking_attempts WHERE attempted_at < now() - interval '1 minute';
  SELECT count(*) INTO v_recent_count FROM public.jubah_tracking_attempts;
  IF v_recent_count >= 20 THEN
    RAISE EXCEPTION 'Too many requests right now. Please wait a minute and try again.';
  END IF;
  INSERT INTO public.jubah_tracking_attempts DEFAULT VALUES;

  RETURN QUERY
  SELECT jb.id, jb.reference, jb.full_name,
         CASE
           WHEN jb.ic_number IS NULL THEN NULL
           WHEN length(regexp_replace(jb.ic_number, '\D', '', 'g')) < 6 THEN NULL
           ELSE substring(regexp_replace(jb.ic_number, '\D', '', 'g') FROM 1 FOR 6) || '-XX-XXXX'
         END AS ic_number,
         jb.hp_number, jb.campus, jb.faculty, jb.university, jb.matric_id, jb.remark,
         jb.status, jb.payment_mode, jb.rider_name, p.phone AS rider_phone,
         jb.cost, jb.balance_due, jb.balance_paid, jb.balance_paid_at,
         jb.initial_paid, jb.initial_paid_at,
         jb.delivery_address, jb.created_at
  FROM public.jubah_bookings jb
  LEFT JOIN public.profiles p ON p.id = jb.rider_id
  WHERE jb.reference = p_reference
    AND right(regexp_replace(jb.ic_number, '\D', '', 'g'), 4) = p_ic_last4;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_receipt(text, text) TO anon, authenticated;

-- get_jubah_booking_live_status: add initial_paid/initial_paid_at for the
-- post-booking receipt on the Jubah booking screen itself.
DROP FUNCTION IF EXISTS public.get_jubah_booking_live_status(text);

CREATE FUNCTION public.get_jubah_booking_live_status(p_reference text)
RETURNS TABLE (
  status           text,
  rider_name       text,
  rider_phone      text,
  balance_paid     boolean,
  balance_paid_at  timestamptz,
  initial_paid     boolean,
  initial_paid_at  timestamptz
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jb.status, jb.rider_name, p.phone AS rider_phone, jb.balance_paid, jb.balance_paid_at,
         jb.initial_paid, jb.initial_paid_at
  FROM public.jubah_bookings jb
  LEFT JOIN public.profiles p ON p.id = jb.rider_id
  WHERE jb.reference = p_reference;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_booking_live_status(text) TO anon, authenticated;
