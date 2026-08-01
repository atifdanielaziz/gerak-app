-- ============================================================
-- Migration: Security Hardening
-- Fixes:
--   1. set_driver_capabilities — add admin/superadmin role check
--      (previously any authenticated user could call this and
--       promote themselves to driver/rental owner)
--   2. Notes field max length constraint (500 chars)
--   3. update_ride_status — enforce driver can only update own orders
--      and only transition to valid next statuses
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ── FIX 1: set_driver_capabilities — enforce caller must be admin/superadmin ──
create or replace function public.set_driver_capabilities(
  p_user_id   uuid,
  p_can_drive boolean,
  p_can_rent  boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_role text;
begin
  -- Verify caller is admin or superadmin
  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if v_caller_role not in ('admin', 'superadmin') then
    raise exception 'Unauthorised: admin or superadmin access required';
  end if;

  update public.profiles
  set can_drive = p_can_drive,
      can_rent  = p_can_rent
  where id = p_user_id;
end;
$$;
grant execute on function public.set_driver_capabilities(uuid, boolean, boolean) to authenticated;

-- ── FIX 2: Notes field max 500 chars ─────────────────────────────────────────
alter table public.ride_orders
  drop constraint if exists ride_orders_notes_length;

alter table public.ride_orders
  add constraint ride_orders_notes_length
  check (char_length(notes) <= 500);

-- ── FIX 3: update_ride_status — restrict allowed status transitions ───────────
-- Drivers can only move orders they own, to valid next states only.
-- Admins/superadmins can override to any valid status.
create or replace function public.update_ride_status(p_order_id uuid, p_status text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_role       text;
  v_driver_id  uuid;
  v_cur_status text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  -- Validate target status is a real status
  if p_status not in ('accepted', 'in_progress', 'completed', 'cancelled') then
    return json_build_object('success', false, 'error', 'Invalid status');
  end if;

  select driver_id, status into v_driver_id, v_cur_status
  from public.ride_orders where id = p_order_id;

  -- Drivers can only update their own orders
  if v_role = 'driver' and v_driver_id <> auth.uid() then
    return json_build_object('success', false, 'error', 'Not your order');
  end if;

  -- Enforce valid driver transitions: accepted→in_progress, in_progress→completed
  if v_role = 'driver' then
    if not (
      (v_cur_status = 'accepted'    and p_status = 'in_progress') or
      (v_cur_status = 'in_progress' and p_status = 'completed')   or
      (v_cur_status = 'accepted'    and p_status = 'cancelled')
    ) then
      return json_build_object('success', false, 'error', 'Invalid status transition');
    end if;
  end if;

  update public.ride_orders
  set status = p_status
  where id = p_order_id;

  return json_build_object('success', true);
end;
$$;
grant execute on function public.update_ride_status(uuid, text) to authenticated;
