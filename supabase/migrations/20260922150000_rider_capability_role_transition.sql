-- set_rider_capabilities only ever touched can_daily/can_robe — role was
-- never part of it. Turning both capabilities off for a role='rider'
-- account (the only tool that exists for "remove their runner access")
-- left them stuck: still role='rider', which routes straight to
-- RiderHome on login regardless of capability (confirmed — RiderHome.tsx
-- never checks can_daily/can_robe), instead of the normal customer
-- Dashboard. Confirmed live with Aqiya (GRK0056): can_daily/can_robe both
-- false, role still 'rider'.
--
-- Now the toggle also moves role between 'customer' and 'rider' as
-- capabilities cross zero, in both directions — granting either
-- capability to a plain customer promotes them to 'rider' (matching how
-- apply_pending_invite's own customer-promotion path already works),
-- and dropping both back to false demotes a 'rider' back to 'customer'.
-- Deliberately scoped to exactly those two roles: a driver/admin/
-- superadmin with can_robe granted keeps their own role regardless of
-- what this toggle does — capability and role are independent for them
-- by design (the whole point of the driver-can-also-robe pattern built
-- earlier), and this must never silently reassign their actual role.

drop function if exists public.set_rider_capabilities(uuid, boolean, boolean);

create or replace function public.set_rider_capabilities(
  p_user_id uuid,
  p_can_daily boolean,
  p_can_robe boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller_role text;
  v_target_role text;
  v_new_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'superadmin') then
    raise exception 'Unauthorised: admin or superadmin access required';
  end if;

  select role into v_target_role from public.profiles where id = p_user_id;
  if v_target_role is null then
    raise exception 'User not found';
  end if;

  v_new_role := v_target_role;
  if v_target_role = 'rider' and not p_can_daily and not p_can_robe then
    v_new_role := 'customer';
  elsif v_target_role = 'customer' and (p_can_daily or p_can_robe) then
    v_new_role := 'rider';
  end if;

  update public.profiles
  set can_daily = p_can_daily,
      can_robe  = p_can_robe,
      role      = v_new_role
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'role', v_new_role,
    'role_changed', v_new_role is distinct from v_target_role
  );
end;
$$;

-- One-time backfill for accounts already stuck in the broken state this
-- fixes going forward — anyone currently role='rider' with both
-- capabilities already false gets corrected immediately rather than
-- waiting for the next time an admin happens to re-touch their capability
-- toggle. protect_privileged_profile_columns (a BEFORE UPDATE trigger on
-- profiles) reverts role changes unless the caller is an authenticated
-- admin/superadmin OR this flag is set — a plain migration run has
-- neither, so without it this UPDATE would silently no-op, exactly the
-- same way the RPC's own role change would from an unauthenticated
-- context. Confirmed live: Aqiya (GRK0056) and Faten Farhana (GRK0050)
-- were both already stuck in this state before this fix; corrected via
-- the real set_rider_capabilities() RPC path (not this raw UPDATE) under
-- a simulated admin session, then verified.
select set_config('app.applying_invite', 'true', true);
update public.profiles
set role = 'customer'
where role = 'rider' and can_daily = false and can_robe = false;
