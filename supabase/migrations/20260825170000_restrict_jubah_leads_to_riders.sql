-- A Jubah Lead is an elevated Jubah Rider, never an Admin or Driver.
-- Enforce that invariant in RPCs and at the table boundary.

update public.jubah_leads l
set is_active = false, updated_at = now()
where not exists (
  select 1 from public.profiles p
  where p.id = l.user_id and p.role = 'rider' and coalesce(p.can_robe, false)
);

create or replace function public.guard_jubah_lead_is_rider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.role = 'rider' and coalesce(p.can_robe, false)
  ) then
    raise exception 'A Jubah Lead must be a Jubah Rider.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_jubah_lead_is_rider_trigger on public.jubah_leads;
create trigger guard_jubah_lead_is_rider_trigger
before insert or update of user_id on public.jubah_leads
for each row execute function public.guard_jubah_lead_is_rider();

create or replace function public.set_jubah_lead(
  p_user_id uuid, p_university_keys text[], p_active boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_key text;
begin
  if public.get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role = 'rider' and coalesce(can_robe, false)
  ) then
    return jsonb_build_object('success', false, 'error', 'Select a Jubah Rider. Drivers and Admins cannot be Jubah Leads.');
  end if;
  if p_active and coalesce(cardinality(p_university_keys), 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'Assign at least one university.');
  end if;
  insert into public.jubah_leads(user_id, is_active, created_by)
  values (p_user_id, p_active, auth.uid())
  on conflict (user_id) do update set is_active = excluded.is_active, updated_at = now();
  delete from public.jubah_lead_universities where lead_id = p_user_id;
  foreach v_key in array coalesce(p_university_keys, array[]::text[]) loop
    insert into public.jubah_lead_universities(lead_id, university_key, assigned_by)
    values (p_user_id, lower(trim(v_key)), auth.uid());
  end loop;
  return jsonb_build_object('success', true);
exception when check_violation or foreign_key_violation then
  return jsonb_build_object('success', false, 'error', 'One or more university assignments are invalid.');
end;
$$;

revoke all on function public.set_jubah_lead(uuid, text[], boolean) from public, anon;
grant execute on function public.set_jubah_lead(uuid, text[], boolean) to authenticated;

-- Invited Leads register as Rider accounts with only the Jubah capability.
create or replace function public.apply_pending_invite()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_current_role text;
  v_invite public.driver_invites;
  v_gerak_id text;
  v_key text;
begin
  if v_uid is null then return jsonb_build_object('applied', false); end if;
  select role into v_current_role from public.profiles where id = v_uid;
  if v_current_role is distinct from 'customer' then return jsonb_build_object('applied', false); end if;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then return jsonb_build_object('applied', false); end if;

  select * into v_invite from public.driver_invites
  where lower(email) = lower(v_email) and not used
  order by created_at desc limit 1;
  if v_invite.id is null then return jsonb_build_object('applied', false); end if;

  v_gerak_id := 'GRK' || lpad(nextval('gerak_id_grk_seq')::text, 4, '0');

  if v_invite.role = 'jubah_lead' then
    perform set_config('app.applying_invite', 'true', true);
    update public.profiles set
      role = 'rider', campus = v_invite.campus,
      gerak_id = coalesce(nullif(gerak_id, ''), v_gerak_id),
      can_drive = false, can_rent = false, can_daily = false,
      can_robe = true, can_transport = false
    where id = v_uid;

    insert into public.jubah_leads(user_id, is_active, created_by)
    values (v_uid, true, v_invite.created_by)
    on conflict (user_id) do update set is_active = true, updated_at = now();

    delete from public.jubah_lead_universities where lead_id = v_uid;
    foreach v_key in array v_invite.jubah_lead_university_keys loop
      insert into public.jubah_lead_universities(lead_id, university_key, assigned_by)
      values (v_uid, v_key, v_invite.created_by);
    end loop;

    update public.driver_invites set used = true, used_at = now() where id = v_invite.id;
    return jsonb_build_object(
      'applied', true, 'role', 'rider', 'jubah_lead', true, 'campus', v_invite.campus,
      'universities', to_jsonb(v_invite.jubah_lead_university_keys)
    );
  end if;

  perform set_config('app.applying_invite', 'true', true);
  update public.profiles set
    role = coalesce(v_invite.role, 'driver'), campus = v_invite.campus,
    gerak_id = v_gerak_id, can_drive = coalesce(v_invite.can_drive, false),
    can_rent = coalesce(v_invite.can_rent, false), can_daily = coalesce(v_invite.can_daily, false),
    can_robe = coalesce(v_invite.can_robe, false), can_transport = coalesce(v_invite.can_transport, false)
  where id = v_uid;
  update public.driver_invites set used = true, used_at = now() where id = v_invite.id;
  return jsonb_build_object('applied', true, 'role', v_invite.role, 'campus', v_invite.campus);
end;
$$;
