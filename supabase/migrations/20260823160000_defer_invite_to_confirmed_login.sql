-- handle_new_user() ran on auth.users INSERT — which fires the instant
-- signUp() is called, BEFORE email confirmation, regardless of who
-- submitted the form. It matched driver_invites by email alone and
-- immediately granted role/campus/capabilities and marked the invite used.
--
-- This app requires email confirmation project-wide (see AppContext.tsx's
-- register()), but that trigger didn't wait for it. Anyone could call
-- signUp({ email: '<invited victim>@x.com', password: '<attacker's own> })
-- before the real invitee ever saw the invite: it silently burns the
-- invite (a DoS the admin won't notice until the real invitee complains
-- their invite "doesn't work"), and creates a driver-role profiles row
-- tied to an auth.users row whose password only the attacker knows. If
-- the real invitee later clicks a confirmation link tied to that same
-- (already-existing, unconfirmed) row — Supabase's default behavior for a
-- second signUp() against an unconfirmed email — the account becomes
-- confirmed while the attacker still holds the password: driver-role
-- account takeover, not just invite-burning.
--
-- Fix: handle_new_user() now always creates a plain customer profile,
-- unconditionally, at raw insert time — never touches driver_invites.
-- apply_pending_invite() is the sole remaining path that ever grants an
-- invite, and it already only runs under a genuine auth.uid() session,
-- which Supabase can only issue after email confirmation succeeds for
-- this project's config. It's already called unconditionally on every
-- login and on every session-restore (AppContext.tsx), including right
-- after the confirmation-link redirect lands — so a freshly-confirmed
-- invitee still gets promoted on their very first real session, just
-- never before one exists.

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
    (id, name, matric_no, email, phone, university, campus, role, points,
     gerak_id, can_drive, can_rent, can_daily, can_robe, can_transport)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Student'),
    coalesce(new.raw_user_meta_data->>'matric_no', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_university,
    v_campus,
    'customer',
    100,
    v_gerak_id,
    false, false, false, false, false
  );
  return new;
end;
$$;
