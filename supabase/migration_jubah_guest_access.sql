-- ============================================================
-- Migration: Public access for Jubah guest booking
-- Run in: Supabase Dashboard > SQL Editor > New query
--
-- Problem: profiles table RLS requires an authenticated session,
-- so a guest (no login) cannot read the rider list to populate
-- the "Select Rider" dropdown on the Jubah booking form.
--
-- Fix: a narrow RPC that exposes ONLY id + name for active,
-- campus+method-matched riders — nothing else from profiles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_active_jubah_riders(p_campus text, p_method text)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, name FROM public.profiles
  WHERE role = 'rider'
    AND campus = p_campus
    AND status = 'active'
    AND jubah_method = p_method
  ORDER BY name;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_jubah_riders(text, text) TO anon, authenticated;

-- Allow guests (no session) to insert Jubah bookings.
-- The existing RLS policy already allows this (no TO authenticated
-- restriction + customer_id IS NULL branch); this grant ensures
-- the anon role has table-level insert privilege too.
GRANT INSERT ON public.jubah_bookings TO anon;

-- app_settings is currently readable by "authenticated" only, which blocks
-- a guest on the Login page from checking whether Jubah period is ON
-- (the "Book Jubah as Guest" button needs this). No sensitive data lives
-- in app_settings (just global feature flags), so public read is safe.
DROP POLICY IF EXISTS "settings_read" ON public.app_settings;
CREATE POLICY "settings_read"
  ON public.app_settings FOR SELECT
  USING (true);
