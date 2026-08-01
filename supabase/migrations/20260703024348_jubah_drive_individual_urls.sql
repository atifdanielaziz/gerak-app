ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS drive_oscar_url   text,
  ADD COLUMN IF NOT EXISTS drive_skpg_url    text,
  ADD COLUMN IF NOT EXISTS drive_konvo_url   text,
  ADD COLUMN IF NOT EXISTS drive_ic_url      text;
