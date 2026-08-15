-- Lightweight presence heartbeat for operational staff monitoring.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_at_idx
  on public.profiles (last_seen_at)
  where role in ('admin', 'superadmin', 'driver', 'rider');

create or replace function public.touch_staff_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid()
     and role in ('admin', 'superadmin', 'driver', 'rider')
     and (last_seen_at is null or last_seen_at < now() - interval '45 seconds');
end;
$$;

revoke all on function public.touch_staff_presence() from public;
grant execute on function public.touch_staff_presence() to authenticated;
