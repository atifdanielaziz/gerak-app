-- ============================================================
-- Migration: ToyyibPay bill tracking for jubah_bookings
-- Adds columns to remember which ToyyibPay bill was created for the
-- initial payment and (deposit mode only) the balance payment, so the
-- toyyibpay-callback edge function can match an incoming callback's
-- billcode back to the right booking + payment stage.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS toyyibpay_bill_code         text,
  ADD COLUMN IF NOT EXISTS toyyibpay_balance_bill_code text;
