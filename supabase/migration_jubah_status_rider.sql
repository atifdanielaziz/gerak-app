-- Add rider-specific status values for Jubah delivery flow
ALTER TABLE public.jubah_bookings
  DROP CONSTRAINT IF EXISTS jubah_bookings_status_check;

ALTER TABLE public.jubah_bookings
  ADD CONSTRAINT jubah_bookings_status_check
  CHECK (status IN (
    'booked',
    'processing',
    'collected',
    'at_hub',
    'picked_up',
    'on_the_way',
    'delivered',
    'cancelled'
  ));
