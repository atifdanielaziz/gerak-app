-- ============================================================
-- Migration: Fix search_profile_by_gerak_id to search drivers
-- Previously hardcoded role = 'customer', now searches drivers
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

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
      and (role = 'driver' or (role in ('admin', 'superadmin') and can_drive = true));
end;
$$;
grant execute on function public.search_profile_by_gerak_id(text) to authenticated;
