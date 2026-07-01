-- ============================================================
-- Migration: Add delivery_address to jubah_bookings
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS delivery_address text;
