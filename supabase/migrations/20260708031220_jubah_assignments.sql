-- ─────────────────────────────────────────────────────────────
-- Jubah Rider Assignments
-- Allows one rider (profile) to have multiple assignments,
-- each with a different drop_point and method.
-- ─────────────────────────────────────────────────────────────

-- 1. Create table
CREATE TABLE IF NOT EXISTS jubah_rider_assignments (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  rider_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  drop_point  TEXT,
  method      TEXT        NOT NULL DEFAULT 'pickup',  -- 'pickup' or 'postage'
  campus      TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE jubah_rider_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read jubah_rider_assignments"  ON jubah_rider_assignments;
DROP POLICY IF EXISTS "Admin write jubah_rider_assignments"  ON jubah_rider_assignments;

CREATE POLICY "Public read jubah_rider_assignments"
  ON jubah_rider_assignments FOR SELECT USING (true);

CREATE POLICY "Admin write jubah_rider_assignments"
  ON jubah_rider_assignments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );

-- 3. Migrate existing data from profiles
INSERT INTO jubah_rider_assignments (rider_id, drop_point, method, campus)
SELECT
  id,
  jubah_drop_point,
  COALESCE(jubah_method, 'pickup'),
  COALESCE(campus, 'Pekan')
FROM profiles
WHERE role = 'rider'
  AND can_robe = TRUE
  AND jubah_drop_point IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. Update get_active_jubah_riders RPC (customer booking form)
DROP FUNCTION IF EXISTS get_active_jubah_riders(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_active_jubah_riders(p_campus TEXT, p_method TEXT)
RETURNS TABLE (id UUID, name TEXT, jubah_drop_point TEXT, ic_number TEXT, phone TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    ja.id,
    p.name,
    ja.drop_point  AS jubah_drop_point,
    p.ic_number,
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

-- 5. Update get_jubah_riders_directory RPC (landing page public directory)
DROP FUNCTION IF EXISTS get_jubah_riders_directory(TEXT);
CREATE OR REPLACE FUNCTION get_jubah_riders_directory(p_campus TEXT)
RETURNS TABLE (id UUID, name TEXT, jubah_drop_point TEXT, ic_number TEXT, phone TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    ja.id,
    p.name,
    ja.drop_point  AS jubah_drop_point,
    p.ic_number,
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
