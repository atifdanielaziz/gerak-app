-- Permanently distinguish a Lead's Base University/Base Campus from the
-- Managed Universities that a superadmin may update later.

alter table public.driver_invites
  add column if not exists jubah_lead_base_university_key text;

update public.driver_invites
set jubah_lead_base_university_key = jubah_lead_university_keys[1]
where role = 'jubah_lead'
  and jubah_lead_base_university_key is null
  and cardinality(jubah_lead_university_keys) > 0;

alter table public.jubah_leads
  add column if not exists base_university_key text,
  add column if not exists base_campus text;

with first_assignment as (
  select distinct on (lead_id) lead_id, university_key
  from public.jubah_lead_universities
  order by lead_id, created_at, university_key
)
update public.jubah_leads l
set base_university_key = f.university_key,
    base_campus = nullif(trim(p.campus), '')
from first_assignment f
join public.profiles p on p.id = f.lead_id
where l.user_id = f.lead_id
  and l.base_university_key is null;

create or replace function public.guard_jubah_lead_base_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.base_university_key is not null and
     (new.base_university_key is distinct from old.base_university_key
      or new.base_campus is distinct from old.base_campus) then
    raise exception 'Base University and Base Campus are permanently locked.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_jubah_lead_base_immutable_trigger on public.jubah_leads;
create trigger guard_jubah_lead_base_immutable_trigger
before update of base_university_key, base_campus on public.jubah_leads
for each row execute function public.guard_jubah_lead_base_immutable();

create or replace function public.guard_jubah_lead_invite_base_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.role = 'jubah_lead' and
     (new.jubah_lead_base_university_key is distinct from old.jubah_lead_base_university_key
      or new.campus is distinct from old.campus) then
    raise exception 'An invited Lead''s Base University and Base Campus are permanently locked.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_jubah_lead_invite_base_immutable_trigger on public.driver_invites;
create trigger guard_jubah_lead_invite_base_immutable_trigger
before update of jubah_lead_base_university_key, campus on public.driver_invites
for each row execute function public.guard_jubah_lead_invite_base_immutable();

alter table public.driver_invites
  drop constraint if exists driver_invites_jubah_lead_base_check;
alter table public.driver_invites
  add constraint driver_invites_jubah_lead_base_check check (
    role <> 'jubah_lead' or (
      jubah_lead_base_university_key is not null
      and jubah_lead_base_university_key = jubah_lead_university_keys[1]
      and nullif(trim(campus), '') is not null
    )
  ) not valid;

create or replace function public.set_jubah_lead(
  p_user_id uuid, p_university_keys text[], p_active boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_base_key text;
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

  select base_university_key into v_base_key
  from public.jubah_leads where user_id = p_user_id;

  if v_base_key is not null and p_active and not (v_base_key = any(coalesce(p_university_keys, array[]::text[]))) then
    return jsonb_build_object('success', false, 'error', 'The Base University is permanently locked and cannot be removed.');
  end if;

  insert into public.jubah_leads(user_id, is_active, created_by)
  values (p_user_id, p_active, auth.uid())
  on conflict (user_id) do update set is_active = excluded.is_active, updated_at = now();

  delete from public.jubah_lead_universities
  where lead_id = p_user_id and (v_base_key is null or university_key <> v_base_key);
  foreach v_key in array coalesce(p_university_keys, array[]::text[]) loop
    insert into public.jubah_lead_universities(lead_id, university_key, assigned_by)
    values (p_user_id, lower(trim(v_key)), auth.uid())
    on conflict (lead_id, university_key) do nothing;
  end loop;
  return jsonb_build_object('success', true);
exception when check_violation or foreign_key_violation then
  return jsonb_build_object('success', false, 'error', 'One or more university assignments are invalid.');
end;
$$;

revoke all on function public.set_jubah_lead(uuid, text[], boolean) from public, anon;
grant execute on function public.set_jubah_lead(uuid, text[], boolean) to authenticated;

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

    insert into public.jubah_leads(
      user_id, is_active, created_by, base_university_key, base_campus
    ) values (
      v_uid, true, v_invite.created_by,
      v_invite.jubah_lead_base_university_key, v_invite.campus
    )
    on conflict (user_id) do update set
      is_active = true,
      base_university_key = coalesce(public.jubah_leads.base_university_key, excluded.base_university_key),
      base_campus = coalesce(public.jubah_leads.base_campus, excluded.base_campus),
      updated_at = now();

    delete from public.jubah_lead_universities where lead_id = v_uid;
    foreach v_key in array v_invite.jubah_lead_university_keys loop
      insert into public.jubah_lead_universities(lead_id, university_key, assigned_by)
      values (v_uid, v_key, v_invite.created_by);
    end loop;

    update public.driver_invites set used = true, used_at = now() where id = v_invite.id;
    return jsonb_build_object(
      'applied', true, 'role', 'rider', 'jubah_lead', true,
      'campus', v_invite.campus,
      'base_university', v_invite.jubah_lead_base_university_key,
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

