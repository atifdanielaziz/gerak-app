-- ============================================================
-- Migration: Track when a Jubah deposit balance was confirmed paid
-- balance_paid was a boolean only — no way to show "paid on [date]"
-- on the receipt. Adds a timestamp, set automatically whenever
-- mark_jubah_balance_paid runs.
--
-- Deliberately does NOT touch track_jubah_booking — per
-- migration_jubah_rider_phone.sql's own comment, that function's live
-- signature in the database has already drifted from every committed
-- migration (it accepts extra undocumented params), so redefining it
-- blind here risks breaking whatever currently depends on that drift.
-- get_jubah_booking_live_status has no such drift (single committed
-- definition, confirmed against migration_jubah_rider_phone.sql).
--
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS balance_paid_at timestamptz;

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
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_jubah_balance_paid(uuid) TO authenticated;

-- ── get_jubah_booking_live_status: also return balance_paid + balance_paid_at
-- (used by Jubah.tsx's post-booking tracking poller) ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_jubah_booking_live_status(p_reference text)
RETURNS TABLE (
  status          text,
  rider_name      text,
  rider_phone     text,
  balance_paid    boolean,
  balance_paid_at timestamptz
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jb.status, jb.rider_name, p.phone AS rider_phone, jb.balance_paid, jb.balance_paid_at
  FROM public.jubah_bookings jb
  LEFT JOIN public.profiles p ON p.id = jb.rider_id
  WHERE jb.reference = p_reference;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_booking_live_status(text) TO anon, authenticated;
