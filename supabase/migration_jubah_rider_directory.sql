-- ============================================================
-- Migration: Public Jubah rider directory
-- Run in: Supabase Dashboard > SQL Editor > New query
--
-- Returns all active Jubah-enabled (can_robe=true) riders for a
-- given campus. Phone shown in full; IC masking is done on the
-- frontend. Callable by anon so it works on the guest landing page.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_jubah_riders_directory(p_campus text DEFAULT '')
RETURNS TABLE (
  id            uuid,
  name          text,
  jubah_drop_point text,
  ic_number     text,
  phone         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT id, name, jubah_drop_point, ic_number, phone
  FROM public.profiles
  WHERE role = 'rider'
    AND can_robe = true
    AND status = 'active'
    AND (p_campus = '' OR campus = p_campus)
  ORDER BY jubah_drop_point NULLS LAST, name;
$$;
GRANT EXECUTE ON FUNCTION public.get_jubah_riders_directory(text) TO anon, authenticated;
