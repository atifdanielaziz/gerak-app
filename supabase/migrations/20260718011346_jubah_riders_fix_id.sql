-- ============================================================
-- Migration: Fix get_active_jubah_riders returning the wrong id
-- Was returning jubah_rider_assignments.id (the assignment row's own
-- primary key) instead of the rider's actual profiles.id. Since this RPC
-- feeds the booking form's rider dropdown, and jubah_bookings.rider_id
-- has a foreign key to profiles(id), every booking with a rider selected
-- was failing to save with a foreign-key-violation error, silently
-- swallowed by the app (the booking-confirmation screen shows regardless).
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

DROP FUNCTION IF EXISTS get_active_jubah_riders(TEXT, TEXT);
CREATE OR REPLACE FUNCTION get_active_jubah_riders(p_campus TEXT, p_method TEXT)
RETURNS TABLE (id UUID, name TEXT, jubah_drop_point TEXT, ic_number TEXT, phone TEXT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id,
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
