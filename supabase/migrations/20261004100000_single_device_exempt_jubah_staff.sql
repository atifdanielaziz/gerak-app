-- ============================================================
-- Migration: Exempt every Jubah rider/lead from single-device sessions
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 20260822090000_single_device_sessions.sql meant "admins, superadmins and
-- Jubah riders remain multi-device", but only checked profiles.role =
-- 'rider'. A Jubah rider can also be a 'driver' (or other staff) account
-- holding the can_robe capability (see 20260920120000_jubah_driver_rider_
-- parity.sql), and a Jubah Lead is tracked in jubah_leads, not in
-- profiles.role — so those accounts were still being signed out whenever
-- they logged in on a second device (reported live on a rider account).
--
-- Exemption is decided server-side from profiles/jubah_leads only — both
-- can_robe and jubah_leads are admin-assigned (profiles' privileged
-- columns are protected by 20260707194602), so a customer can't grant
-- themselves the exemption. Function bodies are otherwise unchanged.

create or replace function public.is_single_device_exempt(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and (p.role in ('admin', 'superadmin', 'rider') or coalesce(p.can_robe, false))
  ) or exists (
    select 1 from public.jubah_leads l
    where l.user_id = p_user_id and l.is_active
  );
$$;

-- Internal helper only — callers go through the two RPCs below.
revoke all on function public.is_single_device_exempt(uuid) from public, anon, authenticated;

create or replace function public.claim_single_device_session()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
begin
  if v_user_id is null or nullif(v_session_id, '') is null then
    raise exception 'Authenticated session required';
  end if;

  if public.is_single_device_exempt(v_user_id) then
    delete from public.user_active_sessions where user_id = v_user_id;
    return false;
  end if;

  insert into public.user_active_sessions (user_id, session_id, claimed_at)
  values (v_user_id, v_session_id, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id,
        claimed_at = excluded.claimed_at;

  return true;
end;
$$;

create or replace function public.validate_single_device_session()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
  v_active_session_id text;
begin
  if v_user_id is null or nullif(v_session_id, '') is null then
    return false;
  end if;

  if public.is_single_device_exempt(v_user_id) then
    return true;
  end if;

  -- Safely enrol sessions that already existed when this migration shipped.
  insert into public.user_active_sessions (user_id, session_id, claimed_at)
  values (v_user_id, v_session_id, now())
  on conflict (user_id) do nothing;

  select session_id into v_active_session_id
  from public.user_active_sessions
  where user_id = v_user_id;

  return v_active_session_id = v_session_id;
end;
$$;

revoke all on function public.claim_single_device_session() from public;
revoke all on function public.validate_single_device_session() from public;
grant execute on function public.claim_single_device_session() to authenticated;
grant execute on function public.validate_single_device_session() to authenticated;

-- Clear any stale single-device claim already recorded for accounts that
-- are now exempt, so they aren't compared against it again.
delete from public.user_active_sessions s
where public.is_single_device_exempt(s.user_id);
