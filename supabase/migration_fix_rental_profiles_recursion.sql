-- ============================================================
-- Migration: Fix infinite RLS recursion between profiles and rental_bookings
-- "rental owner reads customer profiles" (profiles) checks rental_bookings,
-- and "admin reads/updates all rental bookings" + "admin reads all rental
-- vehicles" (migration_rental_admin_access.sql) check profiles directly —
-- a circular RLS dependency that Postgres detects as 42P17 "infinite
-- recursion detected in policy for relation profiles", breaking every
-- SELECT on profiles including sign-in.
-- Fix: route the admin check through public.get_my_role(), which is
-- SECURITY DEFINER and bypasses RLS (same pattern already used by the
-- original "Staff can read all profiles" policy), breaking the cycle.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

drop policy if exists "admin reads all rental bookings" on public.rental_bookings;
create policy "admin reads all rental bookings"
  on public.rental_bookings for select
  using (public.get_my_role() in ('admin', 'superadmin'));

drop policy if exists "admin updates all rental bookings" on public.rental_bookings;
create policy "admin updates all rental bookings"
  on public.rental_bookings for update
  using (public.get_my_role() in ('admin', 'superadmin'));

drop policy if exists "admin reads all rental vehicles" on public.rental_vehicles;
create policy "admin reads all rental vehicles"
  on public.rental_vehicles for select
  using (public.get_my_role() in ('admin', 'superadmin'));
