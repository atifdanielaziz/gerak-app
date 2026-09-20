-- set_rider_jubah_assignment always updated the rider's OLDEST active
-- assignment row (order by created_at limit 1), with zero awareness of
-- which campus the admin was actually viewing. That was harmless while
-- every rider had at most one assignment, but confirmed live: editing
-- Adib's "Method 1" from the UKM-scoped rider sheet (his Bangi/pickup
-- row) silently updated his OLDER Pekan/postage row instead — Bangi
-- never changed, and the admin had no way to tell why the save didn't
-- seem to do anything.
--
-- The frontend already knows exactly which row it opened (jubahAssignments
-- is scoped to the current view — see JubahRiderSubTab.tsx), so it now
-- passes that row's id explicitly instead of leaving the function to guess.
-- p_assignment_id is optional and falls back to the old "oldest, else
-- create at home campus" behavior when omitted, for a rider with no
-- assignment in the current scope yet.

drop function if exists public.set_rider_jubah_assignment(uuid, text, text);

create or replace function public.set_rider_jubah_assignment(
  p_user_id uuid,
  p_method text,
  p_drop_point text,
  p_assignment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller_role text;
  v_campus      text;
  v_target_id   uuid;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'superadmin') then
    raise exception 'Unauthorised: admin or superadmin access required';
  end if;

  select campus into v_campus from public.profiles
  where id = p_user_id and role in ('rider', 'driver', 'admin', 'superadmin');
  if v_campus is null then
    raise exception 'Rider not found';
  end if;

  if p_assignment_id is not null then
    -- Editing the specific row the admin actually opened — must really
    -- belong to this rider, never trust the id blindly.
    select id into v_target_id from public.jubah_rider_assignments
    where id = p_assignment_id and rider_id = p_user_id and is_active = true;
    if v_target_id is null then
      raise exception 'Assignment not found for this rider';
    end if;
    update public.jubah_rider_assignments
    set method = p_method, drop_point = p_drop_point
    where id = v_target_id;
  else
    select id into v_target_id
    from public.jubah_rider_assignments
    where rider_id = p_user_id and is_active = true
    order by created_at
    limit 1;

    if v_target_id is not null then
      update public.jubah_rider_assignments
      set method = p_method, drop_point = p_drop_point
      where id = v_target_id;
    else
      insert into public.jubah_rider_assignments (rider_id, method, drop_point, campus, is_active)
      values (p_user_id, p_method, p_drop_point, v_campus, true);
    end if;
  end if;

  update public.profiles
  set jubah_method = p_method, jubah_drop_point = p_drop_point
  where id = p_user_id;
end;
$$;

revoke all on function public.set_rider_jubah_assignment(uuid, text, text, uuid) from public, anon;
grant execute on function public.set_rider_jubah_assignment(uuid, text, text, uuid) to authenticated;
