-- ============================================================
-- Diagnostic: what RLS policies are ACTUALLY live on jubah_bookings
-- right now? (Not what the migration files say — what's really there.)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Paste the full result back.
-- ============================================================

-- 1. Is RLS even enabled on the table?
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'jubah_bookings';

-- 2. Every policy currently defined on jubah_bookings, with its real condition
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'jubah_bookings';

-- 3. Sanity check: run this AS the service role (which the dashboard uses,
--    bypassing RLS) to confirm the 4 rows genuinely exist with this rider_id
SELECT id, reference, rider_id, status
FROM public.jubah_bookings
WHERE rider_id = '9ee6f10d-c1c9-4ce5-a9c9-67cebab19255';
