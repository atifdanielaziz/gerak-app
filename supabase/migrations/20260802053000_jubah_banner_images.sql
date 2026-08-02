-- ============================================================
-- Migration: Multiple banner images per university (up to 10)
-- Previously each university had exactly one fixed-path image
-- ({key}.jpg in the jubah-banners bucket, upload always replaced it) — no
-- table tracked banners at all, purely a filename convention. This adds a
-- real table so admin can upload/delete individual images, displayed to
-- customers as a swipeable carousel. Display order is upload order
-- (position), no drag-reorder.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create table if not exists public.jubah_banner_images (
  id             uuid primary key default gen_random_uuid(),
  university_key text not null,
  storage_path   text not null,
  position       integer not null,
  created_at     timestamptz default now()
);

create index if not exists jubah_banner_images_univ_pos
  on public.jubah_banner_images (university_key, position);

alter table public.jubah_banner_images enable row level security;

-- Public read — the Jubah landing page's university/banner picker is
-- reachable by guests (no login required), same as the jubah-banners
-- storage bucket itself already being publicly readable.
create policy "jubah_banner_images_read" on public.jubah_banner_images
  for select
  using (true);

-- Admins manage everything.
create policy "jubah_banner_images_admin_all" on public.jubah_banner_images
  for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'superadmin')));
