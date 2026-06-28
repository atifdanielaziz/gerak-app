-- ============================================================
-- Migration: Performance indexes on all hot query paths
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ── ride_orders ──────────────────────────────────────────────

-- Job pool query: pending orders filtered by campus, sorted by date+time
CREATE INDEX IF NOT EXISTS idx_ride_orders_campus_status
  ON public.ride_orders (campus, status);

-- Driver active job + history: filter by driver_id + status
CREATE INDEX IF NOT EXISTS idx_ride_orders_driver_status
  ON public.ride_orders (driver_id, status);

-- Customer order history: filter by customer_id
CREATE INDEX IF NOT EXISTS idx_ride_orders_customer_id
  ON public.ride_orders (customer_id);

-- Admin panel orders: sort by created_at DESC
CREATE INDEX IF NOT EXISTS idx_ride_orders_created_at
  ON public.ride_orders (created_at DESC);

-- Pool sort: by date + time ascending (FIFO queue)
CREATE INDEX IF NOT EXISTS idx_ride_orders_date_time
  ON public.ride_orders (date ASC, time ASC);

-- Monthly reset: release future jobs for inactive drivers
CREATE INDEX IF NOT EXISTS idx_ride_orders_driver_status_date
  ON public.ride_orders (driver_id, status, date);

-- ── profiles ─────────────────────────────────────────────────

-- Admin panel: load drivers + admins + riders by role and campus
CREATE INDEX IF NOT EXISTS idx_profiles_role_campus
  ON public.profiles (role, campus);

-- Receipt tab: drivers with receipts (superadmin view)
CREATE INDEX IF NOT EXISTS idx_profiles_role_expiry
  ON public.profiles (role, fee_receipt_expiry);

-- Monthly reset cron: find expired drivers
CREATE INDEX IF NOT EXISTS idx_profiles_fee_expiry
  ON public.profiles (fee_receipt_expiry)
  WHERE fee_receipt_expiry IS NOT NULL;

-- Search by Gerak ID (admin find driver / customer)
CREATE INDEX IF NOT EXISTS idx_profiles_gerak_id
  ON public.profiles (gerak_id);

-- Rider picker in Jubah: active riders by campus
CREATE INDEX IF NOT EXISTS idx_profiles_role_campus_status
  ON public.profiles (role, campus, status);

-- ── driver_invites ───────────────────────────────────────────

-- Invite list by campus (admin panel)
CREATE INDEX IF NOT EXISTS idx_driver_invites_campus
  ON public.driver_invites (campus, used, created_at DESC);

-- ── routes ───────────────────────────────────────────────────

-- Routes tab: active routes by campus, sorted by point_a
CREATE INDEX IF NOT EXISTS idx_routes_campus_active
  ON public.routes (campus, is_active, point_a);

-- ── announcements ────────────────────────────────────────────

-- Dashboard banners: active announcements by sort order
CREATE INDEX IF NOT EXISTS idx_announcements_active_sort
  ON public.announcements (is_active, sort_order, created_at DESC);
