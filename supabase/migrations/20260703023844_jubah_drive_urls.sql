ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS drive_docs_url    text,
  ADD COLUMN IF NOT EXISTS drive_payment_url text;
