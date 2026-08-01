-- ============================================================
-- Migration: IC Number field on profiles
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add ic_number column (unique — no duplicate ICs allowed)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ic_number text;

-- 2. Unique constraint — one IC per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_ic_number_unique
  ON public.profiles (ic_number)
  WHERE ic_number IS NOT NULL;

-- 3. Index for Verify tab display
CREATE INDEX IF NOT EXISTS idx_profiles_ic_number
  ON public.profiles (ic_number);
