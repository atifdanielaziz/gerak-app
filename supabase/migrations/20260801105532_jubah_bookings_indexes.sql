-- ============================================================
-- Missing jubah_bookings indexes for real, frequent query patterns
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- jubah_bookings never got the index pass ride_orders did in
-- migration_performance_indexes.sql — found while auditing for scale.
-- Pure additive index creation, no behavior change, safe to run anytime.
--
-- 1. created_at — AdminHome.tsx's main "Customer Directory" list orders by
--    this on every load with no index to support the sort.
-- 2. customer_id — checked on every row by the jubah_bookings RLS policy
--    (USING (auth.uid() = customer_id)) for a logged-in customer's own
--    booking reads; never indexed.
-- 3/4. matric_id and ic_number ARE already indexed (idx_jubah_bookings_matric,
--    from migration_jubah_book_rpc_throttle.sql; ic via profiles, not this
--    table) but every actual lookup wraps them in lower()/replace() —
--    track_jubah_booking and get_jubah_receipt (migration_jubah_rate_limit_
--    consolidate.sql, migration_jubah_receipt_ic_gate.sql) — so the plain
--    btree index can't be used by the query planner. These are public,
--    unauthenticated guest RPCs, so the full scan they fall back to today
--    is the highest-value fix here. Expression indexes matching the exact
--    predicate shape close the gap.

create index if not exists idx_jubah_bookings_created_at
  on public.jubah_bookings (created_at desc);

create index if not exists idx_jubah_bookings_customer_id
  on public.jubah_bookings (customer_id);

create index if not exists idx_jubah_bookings_matric_lower
  on public.jubah_bookings (lower(matric_id));

create index if not exists idx_jubah_bookings_ic_stripped
  on public.jubah_bookings (replace(ic_number, '-', ''));
