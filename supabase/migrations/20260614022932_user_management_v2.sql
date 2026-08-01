-- ============================================================
-- Migration v2: update get_all_profiles + add customer search
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Update get_all_profiles — return admin + driver only (exclude superadmin + customer)
create or replace function public.get_all_profiles()
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
    where role in ('admin', 'driver')
    order by
      case role
        when 'admin'  then 1
        when 'driver' then 2
        else               3
      end,
      name;
end;
$$;

-- 2. Search customer by Gerak ID (GP/GB prefix)
create or replace function public.search_profile_by_gerak_id(p_gerak_id text)
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
    where upper(gerak_id) = upper(trim(p_gerak_id))
      and role = 'customer';
end;
$$;
grant execute on function public.search_profile_by_gerak_id(text) to authenticated;
