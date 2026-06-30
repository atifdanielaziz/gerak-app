-- ============================================================
-- Migration: Include jubah_drop_point in the public rider RPC
-- Run in: Supabase Dashboard > SQL Editor > New query
--
-- The customer-facing Jubah form needs to display the admin-set
-- drop point once a rider is selected. Re-create the RPC to
-- also return jubah_drop_point alongside id + name.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_active_jubah_riders(p_campus text, p_method text)
RETURNS TABLE (id uuid, name text, jubah_drop_point text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, name, jubah_drop_point FROM public.profiles
  WHERE role = 'rider'
    AND campus = p_campus
    AND status = 'active'
    AND jubah_method = p_method
  ORDER BY name;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_jubah_riders(text, text) TO anon, authenticated;
