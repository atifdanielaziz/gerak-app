-- ============================================================
-- Migration: App settings table — global feature flags
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings
CREATE POLICY "settings_read"
  ON public.app_settings FOR SELECT
  TO authenticated USING (true);

-- Only admin/superadmin can update settings
CREATE POLICY "settings_update"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- Seed default values
INSERT INTO public.app_settings (key, value)
  VALUES ('jubah_active', 'false')
  ON CONFLICT (key) DO NOTHING;
