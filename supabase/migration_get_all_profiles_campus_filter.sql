-- ============================================================
-- get_all_profiles: filter by campus server-side instead of client-side
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- UsersTab.tsx's loadUsers() fetched every admin/driver/rider profile in
-- the whole system on every load, then threw most of it away client-side
-- with users.filter(u => u.campus === adminCampus) for non-superadmins —
-- and the three follow-up capability-lookup queries (.in('id', driverIds/
-- riderIds/...)) scaled with that same full, unfiltered result set. Adding
-- an optional p_campus param (default null = superadmin's "all campuses"
-- behavior, unchanged) lets a regular admin's session filter at the
-- database instead, shrinking all four queries together. Case-insensitive
-- compare matches the exact behavior of the client-side filter it replaces
-- (toLowerCase() on both sides) — not a behavior change, just moved.

-- A trailing default-valued param still changes the function's arity, so
-- Postgres treats get_all_profiles() and get_all_profiles(text) as distinct
-- overloads rather than one replacing the other — drop the zero-arg version
-- explicitly instead of silently leaving two versions callable.
drop function if exists public.get_all_profiles();

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
      name;
end;
$$;

grant execute on function public.get_all_profiles(text) to authenticated;
