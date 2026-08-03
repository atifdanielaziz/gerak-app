-- ============================================================
-- Dead-code cleanup from security/dead-code audit (2026-08-04)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1) jubah_banner_images — a "multiple banner images per university,
--    swipeable carousel" feature built at the DB layer but never wired to
--    the frontend before being superseded; the actual banner admin UI and
--    customer landing page still use the fixed-path-per-university scheme
--    in the jubah-banners bucket (see 20260803090000_jubah_banners_
--    bucket_policies.sql). No frontend code references this table at all.
drop table if exists public.jubah_banner_images;

-- 2) profiles.rider_active — added for a planned rider online/offline
--    toggle that was never built; rider visibility to customers is
--    actually driven by jubah_rider_assignments.is_active, can_robe, and
--    status (see get_active_jubah_riders). No RPC or frontend code reads
--    or writes this column.
alter table public.profiles
  drop column if exists rider_active;
