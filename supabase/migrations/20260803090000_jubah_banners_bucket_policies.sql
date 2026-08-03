-- ============================================================
-- Migration: Fix/ensure storage RLS policies for the jubah-banners bucket
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- The jubah-banners bucket was created directly via the Supabase dashboard,
-- outside migration tracking — its write policies (insert/update/delete)
-- were missing or broken, so admin uploads/deletes silently affected zero
-- rows: Supabase's storage API returns success even when RLS filters out
-- every row a delete/upsert would have touched, so the app showed
-- "Banner uploaded"/"Banner deleted" while the file in storage never
-- actually changed. This explicitly (re)creates all four policies needed.

insert into storage.buckets (id, name, public)
values ('jubah-banners', 'jubah-banners', true)
on conflict (id) do nothing;

drop policy if exists "jubah_banners_public_read" on storage.objects;
create policy "jubah_banners_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'jubah-banners');

drop policy if exists "jubah_banners_admin_insert" on storage.objects;
create policy "jubah_banners_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'jubah-banners' and public.get_my_role() in ('admin', 'superadmin'));

drop policy if exists "jubah_banners_admin_update" on storage.objects;
create policy "jubah_banners_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'jubah-banners' and public.get_my_role() in ('admin', 'superadmin'))
  with check (bucket_id = 'jubah-banners' and public.get_my_role() in ('admin', 'superadmin'));

drop policy if exists "jubah_banners_admin_delete" on storage.objects;
create policy "jubah_banners_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'jubah-banners' and public.get_my_role() in ('admin', 'superadmin'));
