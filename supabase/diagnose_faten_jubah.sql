-- ============================================================
-- Diagnostic: why is JUB-26-UMPSA-DQIN (or any Faten booking) still
-- invisible to the rider's own job list after the backfill?
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Paste the full result back.
-- ============================================================

-- 1. Faten's actual rider profile
SELECT id, name, role, status, can_robe
FROM public.profiles
WHERE role = 'rider' AND name ILIKE '%faten%';

-- 2. The booking's raw rider_id / rider_name as stored right now
SELECT id, reference, rider_id, rider_name, created_at
FROM public.jubah_bookings
WHERE reference = 'JUB-26-UMPSA-DQIN'
   OR rider_name ILIKE '%faten%';

-- 3. Every jubah_bookings row still missing rider_id, with a looser
--    (trimmed, case-insensitive) match count this time
SELECT
  jb.id, jb.reference, jb.rider_name, jb.created_at,
  (SELECT count(*) FROM public.profiles p
    WHERE p.role = 'rider' AND lower(trim(p.name)) = lower(trim(jb.rider_name))) AS loose_match_count
FROM public.jubah_bookings jb
WHERE jb.rider_id IS NULL
  AND jb.rider_name IS NOT NULL
ORDER BY jb.created_at DESC;
