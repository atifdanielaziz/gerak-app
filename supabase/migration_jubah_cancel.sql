-- ============================================================
-- Migration: Working cancel for Jubah bookings
-- cancelJubahBooking() in AppContext.tsx was dead code — never wired to a
-- button, and only ever cleared local browser state even if it had been,
-- never touching the database. 'cancelled' has always been a valid status
-- value, just never actually reachable.
--
-- Two separate entry points, matching the existing split between
-- submit_jubah_balance (guest) and mark_jubah_balance_paid (admin):
-- - cancel_jubah_booking_customer: guest-callable, only while status is
--   still 'ordered' (nothing paid yet, nothing to refund).
-- - cancel_jubah_booking_admin: admin/superadmin only, works from any
--   non-terminal status — this is the path for a paid booking, where a
--   human needs to be the one deciding, since ToyyibPay refunds aren't
--   automatic and this system has no way to trigger one.
--
-- cancelled_at/cancelled_by give this a basic audit trail — same reasoning
-- as flagged for manual payment confirmation: a status flip with no record
-- of who did it or why isn't good enough once real money can be involved.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text;

-- ── Customer: cancel an unpaid booking ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_jubah_booking_customer(
  p_reference text,
  p_hp_number text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.jubah_bookings
  WHERE reference = p_reference
    AND hp_number = p_hp_number
    AND status = 'ordered'
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This booking can no longer be cancelled here — please contact admin.');
  END IF;

  UPDATE public.jubah_bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'customer'
   WHERE id = v_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_jubah_booking_customer(text, text) TO anon, authenticated;

-- ── Admin: cancel a booking regardless of payment state ────────────────────
CREATE OR REPLACE FUNCTION public.cancel_jubah_booking_admin(
  p_booking_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'superadmin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorised.');
  END IF;

  UPDATE public.jubah_bookings
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'admin'
   WHERE id = p_booking_id
     AND status NOT IN ('cancelled', 'delivered');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found or cannot be cancelled from its current status.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_jubah_booking_admin(uuid) TO authenticated;
