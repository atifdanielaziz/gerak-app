-- ============================================================
-- Drop the unused per-rider Jubah bank details feature
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- migration_jubah_bank_qr_revert_to_shared.sql already reverted the actual
-- booking flow (create_jubah_booking, track_jubah_booking,
-- get_active_jubah_riders) back to the single shared superadmin account,
-- and reverted the jubah-qr storage policies back to superadmin-only. That
-- migration deliberately left the per-rider columns/RPC in place, unused.
--
-- Per product decision, removing them fully now: no frontend code reads or
-- writes any of these, and there was never a rider-facing UI to call
-- set_rider_bank_details in the first place — the only remaining trace was
-- an admin-side "Bank details missing" badge for a field no rider could
-- ever fill in, which is being removed from the UI alongside this.

drop function if exists public.set_rider_bank_details(text, text, text);

alter table public.profiles
  drop column if exists jubah_bank_name,
  drop column if exists jubah_bank_account_number,
  drop column if exists jubah_bank_account_holder;

alter table public.jubah_bookings
  drop column if exists rider_bank_name,
  drop column if exists rider_bank_account_number,
  drop column if exists rider_bank_account_holder;
