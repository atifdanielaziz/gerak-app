-- ============================================================
-- Migration: Allow rental owners to read customer profiles
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Drivers/owners need to see customer name + phone for bookings they own.
-- The "Users can read own profile" policy only lets you see yourself.
-- Add a policy: if a booking row exists where auth.uid() is the owner
-- and the target profile is the customer, allow read.

create policy "rental owner reads customer profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.rental_bookings
      where rental_bookings.owner_id    = auth.uid()
        and rental_bookings.customer_id = profiles.id
    )
  );
