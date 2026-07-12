-- ============================================================
-- Migration: Rental half-hour slot support
-- Changes start_hour and duration from int to numeric so that
-- bookings can start at :30 (e.g. 9.5 = 9:30 AM, duration 1.5 = 1h 30m)
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE public.rental_bookings
  ALTER COLUMN start_hour TYPE numeric USING start_hour::numeric,
  ALTER COLUMN duration   TYPE numeric USING duration::numeric;
