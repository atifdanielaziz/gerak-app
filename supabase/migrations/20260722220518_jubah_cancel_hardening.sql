-- ============================================================
-- Migration: Make 'cancelled' actually terminal, server-side
-- Found on cross-check: toyyibpay-create-bill (fixed separately, redeployed
-- alongside this) could still create a real, payable bill for a cancelled
-- booking's balance — none of its existing checks ruled that out. The same
-- gap existed here: mark_jubah_balance_paid and update_jubah_booking_status
-- had no cancelled guard either. The UI already hides these actions once a
-- booking is cancelled, but that's not a substitute for the RPC enforcing
-- it — a direct call (or a stale open tab from before cancellation) could
-- still resurrect a dead booking's progress or mark a cancelled booking's
-- balance paid with nothing stopping it server-side.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_jubah_balance_paid(
  p_booking_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE  id   = auth.uid()
      AND  role IN ('admin', 'superadmin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorised.');
  END IF;

  UPDATE public.jubah_bookings
     SET balance_paid    = true,
         balance_paid_at = now()
   WHERE id = p_booking_id
     AND status <> 'cancelled';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found or has been cancelled.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_jubah_balance_paid(uuid) TO authenticated;

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

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
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
