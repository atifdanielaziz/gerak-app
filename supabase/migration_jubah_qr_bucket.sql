-- ============================================================
-- Migration: Jubah payment QR code storage bucket
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- One global QR image (not per-university, unlike jubah-banners) shown
-- alongside the bank transfer details customers already see. Public
-- bucket (mirrors jubah-banners) since the QR must be viewable by
-- customers, including guests who haven't logged in yet, with no auth
-- round-trip needed to display it. A fixed object path (qr.jpg) plus
-- upsert:true on upload means a new upload always overwrites the
-- previous file in place — there is never a second, orphaned old image
-- left behind in storage to separately delete.
--
-- Write access is superadmin-only (same reasoning as
-- migration_driver_documents_admin_write.sql: changing what customers
-- transfer money to/scan is more sensitive than viewing it, so it's
-- scoped narrower than the general admin role).

insert into storage.buckets (id, name, public)
values ('jubah-qr', 'jubah-qr', true)
on conflict (id) do nothing;

drop policy if exists "jubah_qr_public_read" on storage.objects;
create policy "jubah_qr_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'jubah-qr');

drop policy if exists "jubah_qr_superadmin_insert" on storage.objects;
create policy "jubah_qr_superadmin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin');

drop policy if exists "jubah_qr_superadmin_update" on storage.objects;
create policy "jubah_qr_superadmin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin')
  with check (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin');

drop policy if exists "jubah_qr_superadmin_delete" on storage.objects;
create policy "jubah_qr_superadmin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'jubah-qr' and public.get_my_role() = 'superadmin');
