-- ============================================================
-- Migration: Jubah rider directory v2
-- Accepts an array of campus names so UMPSA can pass ['Pekan','Gambang']
-- Also returns `method` field (missing from original RPC).
-- SECURITY DEFINER + anon grant so guests on the landing page can call it.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_jubah_riders_directory_v2(p_campuses text[])
RETURNS TABLE (
  id          uuid,
  name        text,
  drop_point  text,
  method      text,
  ic_number   text,
  phone       text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    ja.id,
    p.name,
    ja.drop_point,
    ja.method,
    p.ic_number,
    p.phone
  FROM jubah_rider_assignments ja
  JOIN profiles p ON p.id = ja.rider_id
  WHERE ja.campus    = ANY(p_campuses)
    AND ja.is_active = TRUE
    AND p.role       = 'rider'
    AND p.can_robe   = TRUE
    AND p.status     = 'active'
  ORDER BY ja.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_riders_directory_v2(text[]) TO anon, authenticated;
