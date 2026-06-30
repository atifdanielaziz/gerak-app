-- ============================================================
-- Migration: set_rider_capabilities RPC
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create or replace function public.set_rider_capabilities(
  p_user_id   uuid,
  p_can_daily boolean,
  p_can_robe  boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if v_caller_role not in ('admin', 'superadmin') then
    raise exception 'Unauthorised: admin or superadmin access required';
  end if;

  update public.profiles
  set can_daily = p_can_daily,
      can_robe  = p_can_robe
  where id = p_user_id;
end;
$$;
grant execute on function public.set_rider_capabilities(uuid, boolean, boolean) to authenticated;
