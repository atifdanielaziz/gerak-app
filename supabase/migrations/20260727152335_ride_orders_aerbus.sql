-- ============================================================
-- Migration: AerBus (Airport/Bus pickup & drop) booking mode
-- Adds the fields needed for Gerak Car's new "AerBus" booking mode —
-- two-way airport/bus-terminal transfers with an automatic dispatch-time
-- buffer, so the driver leaves early enough to either (a) get the customer
-- to the airport/bus station with margin before their ticket time, or
-- (b) already be waiting when the customer's flight/bus lands.
--
-- ride_orders.date/time already hold the ACTUAL dispatch time the driver
-- acts on (unchanged meaning — every existing DriverHome/RiderHome sort,
-- filter, and display keeps working as-is). aerbus_customer_time preserves
-- what the customer actually typed (their ticket's boarding/landing time)
-- purely for display, so nothing gets silently overwritten.
--
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.ride_orders
  ADD COLUMN IF NOT EXISTS aerbus_direction text,
  ADD COLUMN IF NOT EXISTS aerbus_point text,
  ADD COLUMN IF NOT EXISTS aerbus_customer_time text;

ALTER TABLE public.ride_orders DROP CONSTRAINT IF EXISTS ride_orders_aerbus_direction_check;
ALTER TABLE public.ride_orders
  ADD CONSTRAINT ride_orders_aerbus_direction_check
  CHECK (aerbus_direction IS NULL OR aerbus_direction IN ('to', 'from'));

ALTER TABLE public.ride_orders DROP CONSTRAINT IF EXISTS ride_orders_aerbus_point_check;
ALTER TABLE public.ride_orders
  ADD CONSTRAINT ride_orders_aerbus_point_check
  CHECK (aerbus_point IS NULL OR aerbus_point IN ('airport', 'tsk', 'pekan_bus'));

COMMENT ON COLUMN public.ride_orders.aerbus_direction IS
  'AerBus only. ''to'' = customer heading to the airport/bus point (buffer subtracted from their ticket time gives the campus pickup time). ''from'' = customer arriving at the airport/bus point (buffer subtracted from their landing/arrival time gives when the driver must leave campus to be there in time).';
COMMENT ON COLUMN public.ride_orders.aerbus_point IS
  'AerBus only. Which fixed point: airport, tsk, or pekan_bus.';
COMMENT ON COLUMN public.ride_orders.aerbus_customer_time IS
  'AerBus only. The raw ticket boarding/landing time (HH:MM) the customer entered, before the buffer was applied — date/time columns hold the buffered dispatch time actually used everywhere else.';
