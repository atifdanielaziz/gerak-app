-- ============================================================
-- Capture gender at sign-up (Register.tsx now sends it)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
-- Same shape as every other field this trigger already reads out of
-- raw_user_meta_data — see 20260823160000_defer_invite_to_confirmed_login.sql
-- for the full current body this replaces. Nullable column, so a signup
-- that omits it (OAuth, or any client not yet updated) just leaves it null,
-- same as an existing account before this feature shipped.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus     text;
  v_university text;
  v_gerak_id   text;
begin
  v_campus     := coalesce(new.raw_user_meta_data->>'campus', '');
  v_university := coalesce(new.raw_user_meta_data->>'university', '');
  v_gerak_id   := 'GRK' || lpad(nextval('gerak_id_grk_seq')::text, 4, '0');

  insert into public.profiles
    (id, name, matric_no, email, phone, university, campus, gender, role, points,
     gerak_id, can_drive, can_rent, can_daily, can_robe, can_transport)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Student'),
    coalesce(new.raw_user_meta_data->>'matric_no', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_university,
    v_campus,
    nullif(new.raw_user_meta_data->>'gender', ''),
    'customer',
    100,
    v_gerak_id,
    false, false, false, false, false
  );
  return new;
end;
$$;
