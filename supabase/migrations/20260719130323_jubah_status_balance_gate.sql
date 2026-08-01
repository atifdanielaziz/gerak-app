-- ============================================================
-- Migration: Enforce the Jubah deposit-balance gate server-side
-- AdminHome.tsx disables the "Advance Status" button for a deposit
-- booking until its balance is confirmed paid, but update_jubah_booking_status
-- itself had no matching check — anyone with rider/admin access could call
-- it directly and advance (even to 'delivered') without the balance ever
-- being paid, bypassing the UI gate entirely.
-- The 'ordered' -> 'booked' transition is exempted since that happens
-- through a separate handler before the balance is even relevant.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

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
     SET status = p_status
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_jubah_booking_status(uuid, text) TO authenticated;
