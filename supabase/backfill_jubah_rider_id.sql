-- ============================================================
-- One-time backfill: repair jubah_bookings.rider_id on rows saved
-- before get_active_jubah_riders was fixed (migration_jubah_riders_fix_id.sql).
-- That bug made every booking-with-rider silently fail to save
-- rider_id (FK violation, swallowed error) — rider_name (a separate
-- denormalized text column) saved fine, so those bookings display a
-- rider's name everywhere but are invisible to that rider's own job
-- list, which filters strictly on rider_id.
--
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Step 1 — inspect first. Each row here is a booking with a rider name
-- on it but no rider_id, next to how many 'rider' profiles share that
-- exact name. match_count = 1 is safe to auto-fix; anything else (0 or
-- 2+) needs manual review — don't guess on a name collision.
SELECT
  jb.id, jb.reference, jb.rider_name, jb.created_at,
  (SELECT count(*) FROM public.profiles p
    WHERE p.role = 'rider' AND p.name = jb.rider_name) AS match_count
FROM public.jubah_bookings jb
WHERE jb.rider_id IS NULL
  AND jb.rider_name IS NOT NULL
ORDER BY jb.created_at DESC;

-- Step 2 — only run this after reviewing Step 1's output. Fixes only
-- the unambiguous rows (exactly one rider profile with that name).
UPDATE public.jubah_bookings jb
SET rider_id = p.id
FROM public.profiles p
WHERE jb.rider_id IS NULL
  AND jb.rider_name IS NOT NULL
  AND p.role = 'rider'
  AND p.name = jb.rider_name
  AND (SELECT count(*) FROM public.profiles p2
        WHERE p2.role = 'rider' AND p2.name = jb.rider_name) = 1;
