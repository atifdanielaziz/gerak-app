-- ============================================================
-- Migration: account_deletion_requests — make "Delete Account" a real request
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Profile.tsx's "Delete Account" button previously just showed
-- confirm()/alert() with no backend call at all — "Our team will process it
-- within 24 hours" was never true, since nothing was ever recorded. This
-- table gives it somewhere real to land. Actual account/data deletion is
-- deliberately NOT automated here — that's a destructive, hard-to-reverse
-- operation that belongs behind explicit admin review, not a client-side
-- button with no confirmation step beyond a browser confirm().
create table if not exists public.account_deletion_requests (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  email        text        not null,
  full_name    text,
  gerak_id     text,
  campus       text,
  status       text        not null default 'pending' check (status in ('pending', 'processed', 'cancelled')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null
);

alter table public.account_deletion_requests enable row level security;

-- A user can file their own request and see its status.
create policy "user_insert_own_deletion_request"
  on public.account_deletion_requests for insert
  with check (auth.uid() = user_id);

create policy "user_read_own_deletion_request"
  on public.account_deletion_requests for select
  using (auth.uid() = user_id);

-- Admin/superadmin can see and update every request (to action it).
create policy "admin_manage_deletion_requests"
  on public.account_deletion_requests for all
  using (public.get_my_role() in ('admin', 'superadmin'))
  with check (public.get_my_role() in ('admin', 'superadmin'));
