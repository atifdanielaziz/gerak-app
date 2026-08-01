-- ============================================================
-- Migration: gerak_id column + phone-login RPC + updated trigger
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add gerak_id column to profiles
alter table public.profiles
  add column if not exists gerak_id text unique;

-- 2. RPC: preview next gerak_id for a given campus (called from registration form)
create or replace function public.get_next_gerak_id(p_campus text)
returns text
language plpgsql
security definer
as $$
declare
  v_prefix text;
  v_count  integer;
begin
  v_prefix := case when p_campus = 'Pekan' then 'GP' else 'GB' end;
  select count(*) + 1 into v_count
  from public.profiles
  where campus = p_campus;
  return v_prefix || lpad(v_count::text, 5, '0');
end;
$$;
grant execute on function public.get_next_gerak_id(text) to anon, authenticated;

-- 3. Update trigger: auto-generate gerak_id on new registration
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_campus   text;
  v_prefix   text;
  v_count    integer;
  v_gerak_id text;
begin
  v_campus := coalesce(new.raw_user_meta_data->>'campus', '');
  v_prefix := case when v_campus = 'Pekan' then 'GP' else 'GB' end;

  select count(*) + 1 into v_count
  from public.profiles
  where campus = v_campus;

  v_gerak_id := v_prefix || lpad(v_count::text, 5, '0');

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
    'customer',
    100,
    v_gerak_id
  );
  return new;
end;
$$ language plpgsql security definer;
