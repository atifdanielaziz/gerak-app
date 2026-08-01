-- ============================================================
-- Migration: announcements table for promo banners
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create table if not exists public.announcements (
  id         uuid        primary key default gen_random_uuid(),
  tag        text        not null default '📢 Announcement',
  title      text        not null,
  subtitle   text        not null default '',
  cta_label  text        not null default 'Learn More',
  cta_page   text        not null default 'dashboard',
  emoji      text        not null default '📣',
  gradient   text        not null default 'from-emerald-700 via-emerald-600 to-teal-500',
  is_active  boolean     not null default true,
  sort_order int         not null default 0,
  created_by uuid        references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- Anyone logged in can read active announcements
create policy "read_active_announcements"
  on public.announcements for select
  using (is_active = true);

-- Admins can read all (including inactive) and write
create policy "admins_full_announcements"
  on public.announcements for all
  using (public.get_my_role() in ('admin', 'superadmin'));
