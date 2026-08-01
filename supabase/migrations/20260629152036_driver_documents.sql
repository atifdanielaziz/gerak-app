-- ============================================================
-- Migration: Driver/Rider document verification (Gate 1)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add document columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ic_url              text,
  ADD COLUMN IF NOT EXISTS license_url         text,
  ADD COLUMN IF NOT EXISTS docs_status         text NOT NULL DEFAULT 'none'
    CHECK (docs_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS docs_reject_reason  text;

-- 2. Index for admin Verify tab queries
CREATE INDEX IF NOT EXISTS idx_profiles_docs_status
  ON public.profiles (role, docs_status, campus);

-- 3. Storage bucket: driver-documents (private)
-- Run this separately in Storage settings if bucket doesn't exist yet:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('driver-documents', 'driver-documents', false);

-- 4. RLS: drivers/riders can upload their own documents
CREATE POLICY "driver_upload_own_docs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. RLS: drivers/riders can read their own documents
CREATE POLICY "driver_read_own_docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. RLS: drivers/riders can replace their own documents
CREATE POLICY "driver_update_own_docs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 7. RLS: admin/superadmin can read all documents for review
CREATE POLICY "admin_read_all_docs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND public.get_my_role() IN ('admin', 'superadmin')
  );

-- 8. RPC: admin approve documents
CREATE OR REPLACE FUNCTION public.approve_driver_docs(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.profiles
    SET docs_status        = 'approved',
        docs_reject_reason = NULL
    WHERE id = p_user_id
      AND role IN ('driver', 'rider');
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_driver_docs(uuid) TO authenticated;

-- 9. RPC: admin reject documents
CREATE OR REPLACE FUNCTION public.reject_driver_docs(p_user_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  UPDATE public.profiles
    SET docs_status        = 'rejected',
        docs_reject_reason = p_reason
    WHERE id = p_user_id
      AND role IN ('driver', 'rider');
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_driver_docs(uuid, text) TO authenticated;
