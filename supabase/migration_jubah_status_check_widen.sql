-- ============================================================
-- Migration: Add 'ordered' and 'paid' to jubah_bookings' status check
-- The live jubah_bookings_status_check constraint only ever allowed
-- ('booked','processing','collected','at_hub','picked_up','on_the_way',
-- 'delivered','cancelled') — 'ordered' and 'paid' were never in it, despite
-- being referenced throughout the app (AdminHome's status labels/gate,
-- the ToyyibPay payment flow) as if they were valid, storable statuses.
--
-- Net effect until now: every booking silently defaulted straight to
-- 'booked' the moment it was created (confirmed directly against the live
-- DB), since the column's default was the only allowed way it ever got a
-- value — any explicit attempt to set 'ordered' or 'paid' has always been
-- silently impossible. This is what migration_jubah_status_default_ordered.sql
-- just ran into. Purely additive — nothing currently allowed is removed.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_bookings DROP CONSTRAINT jubah_bookings_status_check;

ALTER TABLE public.jubah_bookings ADD CONSTRAINT jubah_bookings_status_check
  CHECK (status = ANY (ARRAY[
    'ordered', 'paid', 'booked', 'processing', 'collected',
    'at_hub', 'picked_up', 'on_the_way', 'delivered', 'cancelled'
  ]::text[]));
