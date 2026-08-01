-- ============================================================
-- Migration: Transporter capability (can_transport) — a driver-side
-- capability alongside can_drive (Gerak Car) and can_rent (Gerak Rental)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Gerak Transporter currently has exactly one hardcoded external contact
-- (see GerakTransporter.tsx's PROVIDER constant) with no in-app account.
-- This adds the capability flag so superadmin can assign existing driver
-- accounts as transporter/service providers going forward — grouped with
-- can_drive/can_rent since it's assigned the same way, at the same point
-- (invite time, or later via Staff management), not a separate role.

alter table public.driver_invites
  add column if not exists can_transport boolean not null default false;

alter table public.profiles
  add column if not exists can_transport boolean not null default false;

-- ── handle_new_user — carry can_transport from invite to profile ───────────
-- Based on the current live definition (migration_rider_capabilities.sql,
-- the most recent one touching this function) — only the can_transport
-- lines are new, everything else is unchanged.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus        text;
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
    v_can_drive     := coalesce(v_invite.can_drive, false);
    v_can_rent      := coalesce(v_invite.can_rent, false);
    v_can_daily     := coalesce(v_invite.can_daily, false);
    v_can_robe      := coalesce(v_invite.can_robe, false);
    v_can_transport := coalesce(v_invite.can_transport, false);

    if v_role = 'rider' then
      if v_campus = 'Pekan' then
        v_gerak_id := 'GRP' || lpad(nextval('gerak_id_grp_seq')::text, 4, '0');
      else
        v_gerak_id := 'GRG' || lpad(nextval('gerak_id_grg_seq')::text, 4, '0');
      end if;
    elsif v_role = 'driver' then
      if v_campus = 'Pekan' then
        v_gerak_id := 'GDP' || lpad(nextval('gerak_id_gdp_seq')::text, 4, '0');
      else
        v_gerak_id := 'GDG' || lpad(nextval('gerak_id_gdg_seq')::text, 4, '0');
      end if;
    else
      if v_campus = 'Pekan' then
        v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
      else
        v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
      end if;
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
    (id, name, matric_no, email, phone, university, campus, role, points,
     gerak_id, can_drive, can_rent, can_daily, can_robe, can_transport)
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
    v_can_rent,
    v_can_daily,
    v_can_robe,
    v_can_transport
  );
  return new;
end;
$$;

-- ── protect_privileged_profile_columns — add can_transport to the
-- self-update guard so a non-admin can't grant this to themselves via a
-- direct table update, same as every other capability column here.
-- Based on the current live definition (migration_security_fix_h1_h2.sql,
-- the most recent one touching this function).
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.get_my_role() in ('admin', 'superadmin') then
    return new;
  end if;

  new.role                      := old.role;
  new.status                    := old.status;
  new.campus                    := old.campus;
  new.can_drive                 := old.can_drive;
  new.can_rent                  := old.can_rent;
  new.can_daily                 := old.can_daily;
  new.can_robe                  := old.can_robe;
  new.can_transport              := old.can_transport;
  new.receipt_gate_exempt       := old.receipt_gate_exempt;
  new.docs_reject_reason        := old.docs_reject_reason;
  new.fee_receipt_verified      := old.fee_receipt_verified;
  new.fee_receipt_amount        := old.fee_receipt_amount;
  new.fee_receipt_date          := old.fee_receipt_date;
  new.fee_receipt_expiry        := old.fee_receipt_expiry;
  new.fee_receipt_reject_reason := old.fee_receipt_reject_reason;
  new.gerak_id                  := old.gerak_id;
  new.points                    := old.points;
  new.jubah_method               := old.jubah_method;
  new.jubah_drop_point            := old.jubah_drop_point;

  if new.docs_status is distinct from old.docs_status and new.docs_status is distinct from 'pending' then
    new.docs_status := old.docs_status;
  end if;

  return new;
end;
$$;

-- ── set_driver_capabilities — add p_can_transport as a 3rd capability.
-- Signature changed (3 args instead of 2) — drop the old 2-arg overload
-- first, same trap already hit and fixed for other RPCs this session.
drop function if exists public.set_driver_capabilities(uuid, boolean, boolean);

create or replace function public.set_driver_capabilities(
  p_user_id       uuid,
  p_can_drive     boolean,
  p_can_rent      boolean,
  p_can_transport boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if v_caller_role not in ('admin', 'superadmin') then
    raise exception 'Unauthorised: admin or superadmin access required';
  end if;

  update public.profiles
  set can_drive     = p_can_drive,
      can_rent      = p_can_rent,
      can_transport = p_can_transport
  where id = p_user_id;
end;
$$;
grant execute on function public.set_driver_capabilities(uuid, boolean, boolean, boolean) to authenticated;
