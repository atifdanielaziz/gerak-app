-- notifications was pure client-side useState([]) — every reload/session
-- wiped it, "Mark All Read" only ever flipped in-memory state, and the
-- Campus Inbox showing empty wasn't a bug losing data, it's that nothing
-- was ever actually stored anywhere. Gives it a real table so history
-- (and read state) survives a reload or a fresh login.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  type text not null check (type in ('system', 'transport', 'jubah')),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- addNotification() fires client-side off events the client itself
-- observed (a status change it just polled/received over realtime) —
-- there's no server-authoritative push behind it, so letting a user
-- insert/update/delete their own rows is consistent with how it already
-- worked, not a new trust boundary. Worst case is a user spamming their
-- own inbox, which affects only them.
create policy "notifications_own_all" on public.notifications
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index notifications_user_id_created_idx on public.notifications(user_id, created_at desc);
