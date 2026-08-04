-- ============================================================
-- GRK ID migration — replace the campus-letter Gerak ID scheme
-- (GP/GB customer, GDP/GDG driver, GRP/GRG rider) with a single neutral
-- GRK + 4-digit sequential ID for every non-superadmin role.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Depends on: 20260804125000_widen_invite_university_campus.sql
--   (driver_invites.university must already exist)
-- ============================================================
--
-- The old scheme baked campus into the ID itself (Pekan vs Gambang, one
-- letter each). That can't extend to the 12-campus list this project now
-- assigns staff/customers under — there's no collision-free single letter
-- (Pekan vs Puncak Alam both P, Kota Bharu vs Kuantan both K, Shah Alam vs
-- Sintok both S). Campus stays a plain data column; it's simply no longer
-- part of the ID. Superadmin IDs (AD1/AD2-style) are plain hand-set data
-- with no code path assigning them — untouched by any of this.

create sequence if not exists gerak_id_grk_seq start 1;

-- ── handle_new_user — collapse rider/driver/customer × campus branching
-- down to one unconditional GRK assignment. Based on the current live
-- definition (20260729160430_transporter_capability.sql, the most recent
-- one touching this function) — only the ID-generation and university
-- lines changed, everything else (capabilities, role assignment) is
-- unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus        text;
  v_university    text;
  v_role          text;
  v_gerak_id      text;
  v_can_drive     boolean := false;
  v_can_rent      boolean := false;
  v_can_daily     boolean := false;
  v_can_robe      boolean := false;
  v_can_transport boolean := false;
  v_invite        public.driver_invites;
begin
  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(new.email) and not used;

  if v_invite.id is not null then
    v_role          := coalesce(v_invite.role, 'driver');
    v_campus        := v_invite.campus;
    -- Prefer the invite's own university (set by the admin who invited
    -- them) over anything the client might submit — an invited user's
    -- university/campus are assigned, not self-chosen.
    v_university    := coalesce(v_invite.university, new.raw_user_meta_data->>'university', '');
    v_can_drive     := coalesce(v_invite.can_drive, false);
    v_can_rent      := coalesce(v_invite.can_rent, false);
    v_can_daily     := coalesce(v_invite.can_daily, false);
    v_can_robe      := coalesce(v_invite.can_robe, false);
    v_can_transport := coalesce(v_invite.can_transport, false);

    update public.driver_invites
      set used = true, used_at = now()
      where id = v_invite.id;

  else
    v_role       := 'customer';
    v_campus     := coalesce(new.raw_user_meta_data->>'campus', '');
    v_university := coalesce(new.raw_user_meta_data->>'university', '');
  end if;

  v_gerak_id := 'GRK' || lpad(nextval('gerak_id_grk_seq')::text, 4, '0');

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
    v_role,
    100,
    v_gerak_id,
    v_can_drive,
    v_can_rent,
    v_can_daily,
    v_can_robe,
    v_can_transport
  );
  return new;
end;
$$;

-- ── apply_pending_invite — same collapse. Based on the current live
-- definition (20260730234809_apply_pending_invite.sql). This function
-- only promotes an existing account and never touched university, so
-- that behavior is left exactly as-is.
create or replace function public.apply_pending_invite()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid          uuid := auth.uid();
  v_email        text;
  v_current_role text;
  v_invite       public.driver_invites;
  v_gerak_id     text;
begin
  if v_uid is null then
    return jsonb_build_object('applied', false);
  end if;

  select role into v_current_role from public.profiles where id = v_uid;
  if v_current_role is distinct from 'customer' then
    return jsonb_build_object('applied', false);
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    return jsonb_build_object('applied', false);
  end if;

  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(v_email) and not used;

  if v_invite.id is null then
    return jsonb_build_object('applied', false);
  end if;

  v_gerak_id := 'GRK' || lpad(nextval('gerak_id_grk_seq')::text, 4, '0');

  -- Transaction-local only (set_config's third arg = true) — cleared
  -- automatically once this call's transaction ends, so it can never
  -- leak into an unrelated later query on a pooled/reused connection.
  perform set_config('app.applying_invite', 'true', true);

  update public.profiles set
    role          = coalesce(v_invite.role, 'driver'),
    campus        = v_invite.campus,
    gerak_id      = v_gerak_id,
    can_drive     = coalesce(v_invite.can_drive, false),
    can_rent      = coalesce(v_invite.can_rent, false),
    can_daily     = coalesce(v_invite.can_daily, false),
    can_robe      = coalesce(v_invite.can_robe, false),
    can_transport = coalesce(v_invite.can_transport, false)
  where id = v_uid;

  update public.driver_invites
    set used = true, used_at = now()
    where id = v_invite.id;

  return jsonb_build_object('applied', true, 'role', v_invite.role, 'campus', v_invite.campus);
end;
$$;

-- ── Consolidated preview RPC — 0-arg since ID generation is now
-- campus/role-independent. Replaces get_next_gerak_id(text),
-- get_next_driver_gerak_id(text), get_next_rider_gerak_id(text).
-- Explicit drops needed (not just create-or-replace) since the
-- parameter list changes — CREATE OR REPLACE with a different arg list
-- adds a new overload instead of replacing.
drop function if exists public.get_next_gerak_id(text);
drop function if exists public.get_next_driver_gerak_id(text);
drop function if exists public.get_next_rider_gerak_id(text);

create or replace function public.get_next_gerak_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count  bigint;
  v_called boolean;
begin
  select last_value, is_called into v_count, v_called from gerak_id_grk_seq;
  return 'GRK' || lpad((case when v_called then v_count + 1 else v_count end)::text, 4, '0');
end;
$$;
grant execute on function public.get_next_gerak_id() to anon, authenticated;

-- ── One-time backfill of existing IDs, ordered by created_at, excluding
-- superadmin (whose IDs are plain hand-set data, e.g. AD1/AD2 — no code
-- path assigns them, so they're identified by role, not by pattern-
-- matching the old ID shape). Wrapped in an idempotency guard so this
-- migration is safe to re-run. Old ID shapes (GP#####/GDP####/GRP####/
-- etc.) can never collide with new GRK#### values, so this single
-- set-based UPDATE is safe regardless of row order.
do $$
begin
  if not exists (select 1 from public.profiles where gerak_id like 'GRK%') then
    perform set_config('app.applying_invite', 'true', true);

    update public.profiles p
    set gerak_id = 'GRK' || lpad(s.rn::text, 4, '0')
    from (
      select id, row_number() over (order by created_at) as rn
      from public.profiles
      where role <> 'superadmin'
    ) s
    where p.id = s.id;

    perform setval('gerak_id_grk_seq',
      (select count(*) from public.profiles where role <> 'superadmin'), true);
  end if;
end $$;

-- ── Drop the 6 old sequences — nothing references them anymore.
drop sequence if exists gerak_id_gp_seq;
drop sequence if exists gerak_id_gb_seq;
drop sequence if exists gerak_id_gdp_seq;
drop sequence if exists gerak_id_gdg_seq;
drop sequence if exists gerak_id_grp_seq;
drop sequence if exists gerak_id_grg_seq;

-- Deploy note: this project applies migrations manually via the Supabase
-- SQL editor, not CI-linked to the frontend deploy. Since this migration
-- drops the 3 old preview RPCs, apply it in the same window as the
-- frontend push — a stale cached PWA calling the old RPC name would
-- otherwise error until it picks up the new build.
