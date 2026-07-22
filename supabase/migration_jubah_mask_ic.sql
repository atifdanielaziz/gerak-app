-- ============================================================
-- Migration: Mask rider IC numbers at the database level
-- get_jubah_riders_directory_v2, get_active_jubah_riders, and
-- get_jubah_riders_directory all returned riders' full, unmasked
-- ic_number to anon callers (no login required). The frontend only ever
-- displays/uses the first 6 digits (RepresentativeSheet's MaskedIc
-- component, and the WhatsApp pre-fill message in Jubah.tsx) — the real
-- last 6 digits never need to leave the database. phone is untouched;
-- it's legitimately shown in full for WhatsApp contact + copy.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Public landing page directory (v2) — actively used by JubahLanding.tsx
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
    CASE
      WHEN p.ic_number IS NULL THEN NULL
      WHEN length(regexp_replace(p.ic_number, '\D', '', 'g')) < 6 THEN NULL
      ELSE substring(regexp_replace(p.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
    END AS ic_number,
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

-- 2. Guest booking form's rider dropdown
DROP FUNCTION IF EXISTS get_active_jubah_riders(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_active_jubah_riders(p_campus TEXT, p_method TEXT)
RETURNS TABLE (id UUID, name TEXT, jubah_drop_point TEXT, ic_number TEXT, phone TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id,
    p.name,
    ja.drop_point  AS jubah_drop_point,
    CASE
      WHEN p.ic_number IS NULL THEN NULL
      WHEN length(regexp_replace(p.ic_number, '\D', '', 'g')) < 6 THEN NULL
      ELSE substring(regexp_replace(p.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
    END AS ic_number,
    p.phone
  FROM jubah_rider_assignments ja
  JOIN profiles p ON p.id = ja.rider_id
  WHERE ja.campus    = p_campus
    AND ja.method    = p_method
    AND ja.is_active = TRUE
    AND p.role       = 'rider'
    AND p.can_robe   = TRUE
    AND p.status     = 'active'
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_jubah_riders(TEXT, TEXT) TO anon, authenticated;

-- 3. Older, unused-by-frontend directory RPC — still anon-callable, fix for consistency
DROP FUNCTION IF EXISTS get_jubah_riders_directory(TEXT);
CREATE OR REPLACE FUNCTION get_jubah_riders_directory(p_campus TEXT)
RETURNS TABLE (id UUID, name TEXT, jubah_drop_point TEXT, ic_number TEXT, phone TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    ja.id,
    p.name,
    ja.drop_point  AS jubah_drop_point,
    CASE
      WHEN p.ic_number IS NULL THEN NULL
      WHEN length(regexp_replace(p.ic_number, '\D', '', 'g')) < 6 THEN NULL
      ELSE substring(regexp_replace(p.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
    END AS ic_number,
    p.phone
  FROM jubah_rider_assignments ja
  JOIN profiles p ON p.id = ja.rider_id
  WHERE ja.campus    = p_campus
    AND ja.is_active = TRUE
    AND p.role       = 'rider'
    AND p.can_robe   = TRUE
    AND p.status     = 'active'
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_riders_directory(TEXT) TO anon, authenticated;
