-- ============================================================
-- Widen campus assignment from UMPSA-only (Pekan/Gambang) to all 6
-- universities Gerak now assigns staff/customers under, and let staff
-- be reassigned across universities, not just campuses within one.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- driver_invites never had a university column (only profiles did) —
-- the invite form only ever offered UMPSA, so it was never needed. Now
-- that Invite Staff picks a real university, the invite needs to carry
-- it through to the new account exactly like it already does for campus.
alter table public.driver_invites add column if not exists university text;

update public.driver_invites set university = 'Universiti Malaysia Pahang Al-Sultan Abdullah'
  where university is null;

-- Widen the campus CHECK from Pekan/Gambang-only to the full 12-campus
-- list across all 6 universities.
alter table public.driver_invites drop constraint if exists driver_invites_campus_check;
alter table public.driver_invites add constraint driver_invites_campus_check
  check (campus in (
    'Pekan','Gambang',                    -- UMPSA
    'Bangi',                              -- UKM
    'Jeli','Bachok','Kota Bharu',         -- UMK
    'Shah Alam','Puncak Alam','Machang',  -- UiTM
    'Gombak','Kuantan',                   -- UIA
    'Sintok'                              -- UUM
  ));

-- check_driver_invite now also returns university, so Register.tsx can
-- lock an invited user's University field (not just Campus) instead of
-- leaving it open — previously harmless only because University was a
-- single hardcoded option there.
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
    'is_driver',  true,
    'campus',     v_invite.campus,
    'university', v_invite.university,
    'role',       coalesce(v_invite.role, 'driver')
  );
end;
$$;
grant execute on function public.check_driver_invite(text) to anon, authenticated;

-- set_driver_campus now also takes p_university, so the Staff tab's ⋮
-- menu can move someone to a different university, not just a different
-- campus within their current one. Signature changed (3 args instead of
-- 2) — drop the old overload first, same trap already hit and fixed for
-- other RPCs in this project (create or replace alone would add a second
-- overload instead of replacing).
drop function if exists public.set_driver_campus(uuid, text);

create or replace function public.set_driver_campus(p_user_id uuid, p_university text, p_campus text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if get_my_role() not in ('admin', 'superadmin') then
    raise exception 'Not authorised';
  end if;

  update public.profiles
  set university = p_university, campus = p_campus
  where id = p_user_id;
end;
$$;

revoke execute on function public.set_driver_campus(uuid, text, text) from public, anon;
grant execute on function public.set_driver_campus(uuid, text, text) to authenticated;

-- routes' own Pekan/Gambang CHECK constraint is deliberately left
-- untouched — Gerak Rides transport stays UMPSA-only; this migration
-- only widens campus assignment for staff/customers, not ride routing.
