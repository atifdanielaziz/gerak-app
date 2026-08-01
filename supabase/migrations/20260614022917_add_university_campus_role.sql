-- ============================================================
-- Migration: add university, campus, role columns to profiles
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add new columns to existing profiles table
alter table public.profiles
  add column if not exists university  text not null default '',
  add column if not exists campus      text not null default '',
  add column if not exists role        text not null default 'customer';

-- 2. Update trigger so new registrations auto-populate these fields
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, matric_no, email, phone, university, campus, role, points)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Student'),
    coalesce(new.raw_user_meta_data->>'matric_no', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'university', ''),
    coalesce(new.raw_user_meta_data->>'campus', ''),
    'customer',
    100
  );
  return new;
end;
$$ language plpgsql security definer;
