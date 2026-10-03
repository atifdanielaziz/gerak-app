-- ============================================================
-- Migration: Jubah tutorial videos storage bucket
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Short how-to videos (book, appoint representative in ICMS, track, pay
-- deposit balance, replace a document) played in-app from JubahLanding,
-- TrackJubah, the booking form and the Help Center. Kept in Storage rather
-- than public/ so they aren't bundled into the Android APK (~30 MB) and can
-- be swapped without an app release. Fixed object names (book.mp4,
-- icms.mp4, track.mp4, balance.mp4, replace.mp4 — see
-- src/lib/jubahTutorials.ts) so a re-upload replaces a video in place.
--
-- Public read (mirrors jubah-banners / jubah-qr) since guests must be able
-- to watch before logging in. Write is superadmin-only, same as jubah-qr.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('jubah-tutorials', 'jubah-tutorials', true, 52428800, array['video/mp4'])
on conflict (id) do nothing;

drop policy if exists "jubah_tutorials_public_read" on storage.objects;
create policy "jubah_tutorials_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'jubah-tutorials');

drop policy if exists "jubah_tutorials_superadmin_insert" on storage.objects;
create policy "jubah_tutorials_superadmin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'jubah-tutorials' and public.get_my_role() = 'superadmin');

drop policy if exists "jubah_tutorials_superadmin_update" on storage.objects;
create policy "jubah_tutorials_superadmin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'jubah-tutorials' and public.get_my_role() = 'superadmin')
  with check (bucket_id = 'jubah-tutorials' and public.get_my_role() = 'superadmin');

drop policy if exists "jubah_tutorials_superadmin_delete" on storage.objects;
create policy "jubah_tutorials_superadmin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'jubah-tutorials' and public.get_my_role() = 'superadmin');
