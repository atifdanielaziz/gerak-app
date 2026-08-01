-- ============================================================
-- Migration: Add sequential booking_no to rental_bookings
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

alter table public.rental_bookings
  add column if not exists booking_no integer generated always as identity;
