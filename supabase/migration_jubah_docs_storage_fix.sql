-- ============================================================
-- Migration: Fix jubah-docs storage exposure
-- The jubah-docs bucket was fully public with no access control at all —
-- guest Jubah bookings (intentionally no-login, kept frictionless) upload
-- IC copies and academic documents here, and anyone with or able to guess
-- a filename could download them without any authentication whatsoever.
-- This makes the bucket private and scopes read access to admin/superadmin
-- and the specific rider assigned to that booking. Uploads stay open to
-- guests since no booking row exists yet at upload time.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

update storage.buckets set public = false where id = 'jubah-docs';

-- Uploads stay open to guests (no booking row exists yet at upload time,
-- so there's nothing to check ownership against) — preserves the
-- frictionless no-login booking flow exactly as it works today.
create policy "jubah docs upload"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'jubah-docs');

-- Admin/superadmin: full oversight access, including bookings that predate
-- this fix (their files aren't foldered by reference, so this stays a
-- blanket role check rather than a per-booking lookup).
create policy "jubah docs admin read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'jubah-docs' and public.get_my_role() in ('admin', 'superadmin'));

-- Assigned rider: works for bookings created after this fix, once uploads
-- are organized under a {reference}/ folder so this lookup has something
-- to match against.
create policy "jubah docs rider read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'jubah-docs'
    and exists (
      select 1 from public.jubah_bookings b
      where b.reference = (storage.foldername(name))[1]
        and b.rider_id = auth.uid()
    )
  );
