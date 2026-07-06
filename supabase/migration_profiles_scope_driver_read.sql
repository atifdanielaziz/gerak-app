-- ============================================================
-- Migration: Scope the driver-read profiles policy to their own customers
-- "Staff can read all profiles" (migration_ride_orders.sql) let any account
-- with role = 'driver' read every other user's full profile row — IC
-- number, matric ID, phone, and long-lived signed document URLs — when it
-- was only ever meant to let a driver see their own current customer's
-- name/phone. This replaces the blanket role check with an actual
-- ownership check via ride_orders (Transport rides) AND rental_bookings
-- (a driver acting as a rental vehicle owner needs to see their renter's
-- name/phone too — DriverHome.tsx:214-215 relies on this).
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

drop policy if exists "Staff can read all profiles" on public.profiles;

create policy "Staff can read all profiles"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.get_my_role() in ('admin', 'superadmin')
    or exists (
      select 1 from public.ride_orders o
      where o.customer_id = profiles.id
        and o.driver_id = auth.uid()
    )
    or exists (
      select 1 from public.rental_bookings r
      where r.customer_id = profiles.id
        and r.owner_id = auth.uid()
    )
  );
