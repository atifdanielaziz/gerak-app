-- ============================================================
-- Close direct-UPDATE privilege escalation on ride_orders
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Same bug class already found and fixed on jubah_bookings (see
-- 20260728191431_jubah_bookings_lock_down_direct_update.sql), never
-- applied here: "staff_update_ride_orders" lets any driver/admin update
-- ANY column on ANY campus-matching row directly via PostgREST, with no
-- column restriction and no with-check — completely bypassing
-- accept_ride_order's atomic "first driver wins" guarantee and
-- update_ride_status's fare-before-complete guard. A driver could set
-- status = 'completed' on someone else's order, reassign driver_id to
-- themselves without ever calling accept_ride_order, or fabricate a fare.
--
-- Verified via grep before writing this fix: no frontend code ever
-- updates ride_orders directly as a driver/admin — DriverHome.tsx only
-- selects; every real driver/admin mutation already goes through
-- accept_ride_order or update_ride_status, both SECURITY DEFINER RPCs
-- that bypass RLS/grants entirely. So dropping this policy has zero
-- functional impact on any real driver/admin flow.
--
-- The one real direct-update path is the customer's own "Edit Booking"
-- flow in Transport.tsx (customer_update_own_pending_ride_order, already
-- scoped to their own still-pending order) — that policy stays, and the
-- column grant below is narrowed to exactly the fields that flow actually
-- writes, so even a customer's own direct REST access can no longer touch
-- status/driver_id/driver_name/driver_contact/accepted_at.

drop policy if exists "staff_update_ride_orders" on public.ride_orders;

revoke update on public.ride_orders from authenticated, anon;
grant update (
  customer_name, campus, date, time, pickup, destination, passengers,
  contact, fare, night_charge, notes, book_mode, aerbus_direction,
  aerbus_point, aerbus_customer_time,
  pickup_lat, pickup_lng, destination_lat, destination_lng
) on public.ride_orders to authenticated;
