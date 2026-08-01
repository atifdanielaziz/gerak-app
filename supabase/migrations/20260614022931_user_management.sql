-- ============================================================
-- Migration: user management — status, terminate, set_status
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add status column to profiles
alter table public.profiles
  add column if not exists status text not null default 'active'
  check (status in ('active', 'inactive'));

-- 2. RPC: get_all_profiles — admin/superadmin can read all profiles
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
    order by
      case role
        when 'superadmin' then 1
        when 'admin'      then 2
        when 'driver'     then 3
        else                   4
      end,
      name;
end;
$$;
grant execute on function public.get_all_profiles() to authenticated;

-- 3. RPC: set_user_status — stop or reactivate an account
create or replace function public.set_user_status(p_user_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_target_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  select role into v_target_role from public.profiles where id = p_user_id;

  if p_user_id = auth.uid() then
    return json_build_object('success', false, 'error', 'Cannot modify your own status');
  end if;
  if v_caller_role not in ('admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Insufficient permissions');
  end if;
  if v_caller_role = 'admin' and v_target_role in ('admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Admins cannot modify other admins');
  end if;

  update public.profiles set status = p_status where id = p_user_id;
  return json_build_object('success', true);
end;
$$;
grant execute on function public.set_user_status(uuid, text) to authenticated;

-- 4. RPC: terminate_user — permanently delete account
create or replace function public.terminate_user(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_target_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  select role into v_target_role from public.profiles where id = p_user_id;

  if p_user_id = auth.uid() then
    return json_build_object('success', false, 'error', 'Cannot terminate your own account');
  end if;
  if v_caller_role not in ('admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Insufficient permissions');
  end if;
  if v_caller_role = 'admin' and v_target_role in ('admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Admins cannot terminate other admins');
  end if;

  -- Cancel any active ride orders for this user
  update public.ride_orders
    set status = 'cancelled'
    where (driver_id = p_user_id or customer_id = p_user_id)
      and status in ('pending', 'accepted', 'in_progress');

  -- Delete profile (FK cascade handles related rows)
  delete from public.profiles where id = p_user_id;

  -- Delete auth user
  delete from auth.users where id = p_user_id;

  return json_build_object('success', true);
end;
$$;
grant execute on function public.terminate_user(uuid) to authenticated;
