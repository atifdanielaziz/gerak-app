-- ============================================================
-- Cap get_all_profiles at a generous row limit
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Same "cap, don't silently truncate" approach used for jubah_bookings —
-- get_all_profiles() (already campus-scoped server-side as of migration_
-- get_all_profiles_campus_filter.sql) had no bound at all. Adds LIMIT 1000
-- inside the function; the client (UsersTab.tsx) separately fetches an
-- exact count via a cheap head:true query so it can show "showing X of Y"
-- if the cap is ever actually hit — at current per-campus user counts
-- (tens, not thousands) this never engages.

create or replace function public.get_all_profiles(p_campus text default null)
returns setof public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() not in ('admin', 'superadmin') then
    raise exception 'Insufficient permissions';
  end if;
  return query
    select * from public.profiles
    where role in ('admin', 'driver', 'rider')
      and (p_campus is null or lower(campus) = lower(p_campus))
    order by
      case role
        when 'admin'  then 1
        when 'driver' then 2
        when 'rider'  then 3
        else               4
      end,
      name
    limit 1000;
end;
$$;
