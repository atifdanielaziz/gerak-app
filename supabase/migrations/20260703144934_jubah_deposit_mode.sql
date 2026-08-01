-- Allow 'deposit' as a valid payment_mode (original constraint only had pickup/postage)
ALTER TABLE public.jubah_bookings
  DROP CONSTRAINT IF EXISTS jubah_bookings_payment_mode_check;

ALTER TABLE public.jubah_bookings
  ADD CONSTRAINT jubah_bookings_payment_mode_check
  CHECK (payment_mode IN ('pickup', 'postage', 'deposit'));
