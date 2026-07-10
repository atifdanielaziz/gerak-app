-- ============================================================
-- Migration: Profile photo (avatar_url)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add avatar_url column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create profile-photos storage bucket (public — avatars are meant to be visible)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies
DROP POLICY IF EXISTS "Avatar upload"  ON storage.objects;
DROP POLICY IF EXISTS "Avatar update"  ON storage.objects;
DROP POLICY IF EXISTS "Avatar read"    ON storage.objects;

CREATE POLICY "Avatar upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Avatar update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Avatar read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-photos');
