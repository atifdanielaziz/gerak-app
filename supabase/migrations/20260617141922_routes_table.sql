-- ============================================================
-- Migration: Create routes table
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.routes (
  id        uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  campus    text         NOT NULL CHECK (campus IN ('Pekan', 'Gambang')),
  point_a   text         NOT NULL,
  point_b   text         NOT NULL,
  price     numeric(8,2) NOT NULL CHECK (price >= 0),
  is_active boolean      NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read routes
CREATE POLICY "routes_select" ON public.routes
  FOR SELECT TO authenticated USING (true);

-- Only admin/superadmin can insert
CREATE POLICY "routes_insert" ON public.routes
  FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('admin', 'superadmin'));

-- Only admin/superadmin can update
CREATE POLICY "routes_update" ON public.routes
  FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- Only admin/superadmin can delete
CREATE POLICY "routes_delete" ON public.routes
  FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));
