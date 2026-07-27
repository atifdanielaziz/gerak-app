-- A payment can be confirmed by ToyyibPay while the booking it belongs to
-- is no longer in the state the callback/expiry job expected (already
-- confirmed another way, already cancelled, etc). Those cases were already
-- being caught and logged via console.error in toyyibpay-callback and
-- jubah-expire-unpaid, but that log only lives in Supabase's Edge Function
-- logs — nobody sees it there in practice. This flags the booking row
-- itself so it surfaces directly in the admin UI instead.
ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS needs_reconciliation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciliation_note text,
  ADD COLUMN IF NOT EXISTS reconciliation_flagged_at timestamptz;
