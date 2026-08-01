-- ============================================================
-- Migration: role pill — invite as driver or admin
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add role column to driver_invites
alter table public.driver_invites
  add column if not exists role text not null default 'driver'
  check (role in ('driver', 'admin'));

-- 2. Update check_driver_invite to return role
create or replace function public.check_driver_invite(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.driver_invites;
begin
  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(p_email) and not used;

  if v_invite.id is null then
    return json_build_object('is_driver', false);
  end if;

  return json_build_object(
    'is_driver', true,
    'campus',    v_invite.campus,
    'role',      coalesce(v_invite.role, 'driver')
  );
end;
$$;
grant execute on function public.check_driver_invite(text) to anon, authenticated;

-- 3. Update handle_new_user — use role from invite
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus    text;
  v_role      text;
  v_gerak_id  text;
  v_can_drive boolean := false;
  v_can_rent  boolean := false;
  v_invite    public.driver_invites;
begin
  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(new.email) and not used;

  if v_invite.id is not null then
    v_role      := coalesce(v_invite.role, 'driver');
    v_campus    := v_invite.campus;
    -- admin always gets full driving capabilities
    if v_role = 'admin' then
      v_can_drive := true;
      v_can_rent  := true;
    else
      v_can_drive := coalesce(v_invite.can_drive, true);
      v_can_rent  := coalesce(v_invite.can_rent,  false);
    end if;
    if v_campus = 'Pekan' then
      v_gerak_id := 'GDP' || lpad(nextval('gerak_id_gdp_seq')::text, 4, '0');
    else
      v_gerak_id := 'GDG' || lpad(nextval('gerak_id_gdg_seq')::text, 4, '0');
    end if;
    update public.driver_invites
      set used = true, used_at = now()
      where id = v_invite.id;
  else
    v_role   := 'customer';
    v_campus := coalesce(new.raw_user_meta_data->>'campus', '');
    if v_campus = 'Pekan' then
      v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
    else
      v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
    end if;
  end if;

  insert into public.profiles
    (id, name, matric_no, email, phone, university, campus, role, points, gerak_id, can_drive, can_rent)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Student'),
    coalesce(new.raw_user_meta_data->>'matric_no', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'university', ''),
    v_campus,
    v_role,
    100,
    v_gerak_id,
    v_can_drive,
    v_can_rent
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. RPC: toggle a user's role (superadmin only)
create or replace function public.toggle_user_role(
  p_target_id uuid,
  p_new_role  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role <> 'superadmin' then
    raise exception 'Only superadmin can change roles';
  end if;
  if p_new_role not in ('driver', 'admin') then
    raise exception 'Invalid role';
  end if;
  update public.profiles
    set role      = p_new_role,
        can_drive = case when p_new_role = 'admin' then true else can_drive end,
        can_rent  = case when p_new_role = 'admin' then true else can_rent  end
    where id = p_target_id;
end;
$$;
grant execute on function public.toggle_user_role(uuid, text) to authenticated;
