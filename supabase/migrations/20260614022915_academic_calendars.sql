-- ============================================================
-- Migration: Academic Calendars (AI-parsed, admin-managed)
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

create table if not exists public.academic_calendars (
  id            uuid        primary key default gen_random_uuid(),
  academic_year text        not null,                          -- e.g. '2026/2027'
  university    text        not null default 'UMPSA',
  semesters     jsonb       not null default '[]'::jsonb,     -- parsed semester + event array
  holidays      text[]      not null default '{}',            -- ISO date strings
  uploaded_by   uuid        references public.profiles(id),
  uploaded_at   timestamptz not null default now(),
  is_active     boolean     not null default false
);

alter table public.academic_calendars enable row level security;

-- Any authenticated user can read active calendars
create policy "read active calendars"
  on public.academic_calendars for select
  using (is_active = true);

-- Admins can insert / update / delete
create policy "admin manage calendars"
  on public.academic_calendars for all
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'superadmin')
    )
  );
