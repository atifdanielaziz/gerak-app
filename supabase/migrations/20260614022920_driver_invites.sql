-- ============================================================
-- Migration: driver_invites — invite-based driver registration
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Sequences for driver Gerak IDs
create sequence if not exists gerak_id_gdp_seq start 1; -- Driver Pekan
create sequence if not exists gerak_id_gdg_seq start 1; -- Driver Gambang

-- 2. driver_invites table
create table if not exists public.driver_invites (
  id         uuid        default gen_random_uuid() primary key,
  email      text        not null,
  campus     text        not null check (campus in ('Pekan', 'Gambang')),
  created_by uuid        references auth.users(id) on delete set null,
  used       boolean     not null default false,
  used_at    timestamptz,
  created_at timestamptz default now()
);

-- Unique pending invite per email (allows re-invite after use)
create unique index if not exists driver_invites_email_pending
  on public.driver_invites (lower(email))
  where not used;

alter table public.driver_invites enable row level security;

-- Admin/superadmin: full access
create policy "admin_all_invites"
  on public.driver_invites for all
  using (public.get_my_role() in ('admin', 'superadmin'))
  with check (public.get_my_role() in ('admin', 'superadmin'));

-- 3. RPC: check if email has a pending invite (callable by anon for registration form)
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

  return json_build_object('is_driver', true, 'campus', v_invite.campus);
end;
$$;
grant execute on function public.check_driver_invite(text) to anon, authenticated;

-- 4. RPC: preview next driver Gerak ID (for registration form)
create or replace function public.get_next_driver_gerak_id(p_campus text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_count  bigint;
  v_called boolean;
begin
  if p_campus = 'Pekan' then
    v_prefix := 'GDP';
    select last_value, is_called into v_count, v_called from gerak_id_gdp_seq;
  else
    v_prefix := 'GDG';
    select last_value, is_called into v_count, v_called from gerak_id_gdg_seq;
  end if;
  return v_prefix || lpad((case when v_called then v_count + 1 else v_count end)::text, 4, '0');
end;
$$;
grant execute on function public.get_next_driver_gerak_id(text) to anon, authenticated;

-- 5. Updated handle_new_user trigger — checks driver_invites before assigning role
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus   text;
  v_role     text;
  v_gerak_id text;
  v_invite   public.driver_invites;
begin
  -- Check if this email has a pending driver invite
  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(new.email) and not used;

  if v_invite.id is not null then
    -- Driver registration — campus + role from invite
    v_role   := 'driver';
    v_campus := v_invite.campus;
    if v_campus = 'Pekan' then
      v_gerak_id := 'GDP' || lpad(nextval('gerak_id_gdp_seq')::text, 4, '0');
    else
      v_gerak_id := 'GDG' || lpad(nextval('gerak_id_gdg_seq')::text, 4, '0');
    end if;
    -- Mark invite as used
    update public.driver_invites
      set used = true, used_at = now()
      where id = v_invite.id;
  else
    -- Customer registration — campus from metadata
    v_role   := 'customer';
    v_campus := coalesce(new.raw_user_meta_data->>'campus', '');
    if v_campus = 'Pekan' then
      v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
    else
      v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
    end if;
  end if;

  insert into public.profiles
    (id, name, matric_no, email, phone, university, campus, role, points, gerak_id)
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
    v_gerak_id
  );
  return new;
end;
$$;

-- Re-wire trigger (safe: drop if exists, then recreate)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
