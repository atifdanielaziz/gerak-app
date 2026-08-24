-- ============================================================
-- Add generic-error handling to terminate_user
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- No exception block around the delete steps — an FK/trigger failure on
-- `delete from public.profiles` or `delete from auth.users` (e.g. a
-- table added later with a restrictive FK the cascade doesn't cover)
-- would leak a raw Postgres error to the admin's browser. Same
-- generic-error wrapper already applied elsewhere this pass. Role/
-- self-target checks are unchanged — already correct.

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

  update public.ride_orders
    set status = 'cancelled'
    where (driver_id = p_user_id or customer_id = p_user_id)
      and status in ('pending', 'accepted', 'in_progress');

  delete from public.profiles where id = p_user_id;

  delete from auth.users where id = p_user_id;

  return json_build_object('success', true);
exception when others then
  raise warning 'terminate_user failed: % (sqlstate %)', sqlerrm, sqlstate;
  return json_build_object('success', false, 'error', 'Something went wrong terminating this account. Please try again, or contact support if this keeps happening.');
end;
$$;
