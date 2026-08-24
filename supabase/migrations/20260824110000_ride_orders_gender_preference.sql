-- ============================================================
-- Gerak Car — "prefer a female driver" (real enforcement, not UI-only)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- The ride pool is a campus-wide broadcast: staff_read_campus_ride_orders
-- lets every active driver/admin/superadmin in a campus SELECT every
-- pending row there, and accept_ride_order lets any of them accept any one
-- of those rows first-come-first-served. A "prefer a female driver" toggle
-- that only hides the option in the UI does nothing — a male driver's app
-- would still list the order and their own direct RPC call would still
-- succeed. Both layers need the same check, or it isn't a preference, it's
-- a suggestion.
--
-- Scope deliberately narrowed to 'female' only (not a general male/female
-- switch) — that's the only case asked for, and a wider CHECK would let a
-- 'male' value exist that no UI ever sets or tests.

alter table public.ride_orders
  add column if not exists preferred_driver_gender text
    check (preferred_driver_gender in ('female'));

-- Customer sets this on their own still-pending row exactly like fare/
-- pickup/notes/etc already are — customer_update_own_pending_ride_order
-- (20260725140145) already scopes the USING/WITH CHECK to own+pending, this
-- just adds the column to what that scoped policy is allowed to touch.
grant update (preferred_driver_gender) on public.ride_orders to authenticated;

-- Driver/admin/superadmin SELECT — same campus scoping as before, plus: a
-- gender-flagged row is invisible to a driver whose own profile doesn't
-- match. admin/superadmin still see everything in their scope (unchanged
-- from before this migration) — they need it for the Orders tab badge and
-- to be able to step in on a stuck ride.
drop policy if exists "staff_read_campus_ride_orders" on public.ride_orders;
create policy "staff_read_campus_ride_orders"
  on public.ride_orders for select
  using (
    public.get_my_role() in ('driver', 'admin', 'superadmin')
    and (
      public.get_my_role() = 'superadmin'
      or public.get_my_campus() = campus
    )
    and (
      preferred_driver_gender is null
      or public.get_my_role() in ('admin', 'superadmin')
      or public.get_my_gender() = preferred_driver_gender
    )
  );

-- Defense in depth: even a driver who never sees the row in their own
-- query (RLS above already hides it) shouldn't be able to accept it by
-- calling the RPC directly with a guessed/observed order id. Same
-- structure as 20260725205206's accept_ride_order — only the new gender
-- clause is added to the UPDATE's WHERE.
create or replace function public.accept_ride_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_phone   text;
  v_role    text;
  v_campus  text;
  v_gender  text;
  v_order   public.ride_orders;
begin
  select name, phone, role, campus, gender
    into v_name, v_phone, v_role, v_campus, v_gender
    from public.profiles where id = auth.uid();

  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  if exists (
    select 1 from public.ride_orders
    where driver_id = auth.uid() and status in ('accepted', 'in_progress')
  ) then
    return json_build_object('success', false, 'error', 'You already have an active job — finish or cancel it before accepting another.');
  end if;

  begin
    update public.ride_orders
      set status         = 'accepted',
          driver_id      = auth.uid(),
          driver_name    = v_name,
          driver_contact = v_phone,
          accepted_at    = now()
      where id = p_order_id
        and status = 'pending'
        and (v_role = 'superadmin' or campus = v_campus)
        and (
          preferred_driver_gender is null
          or v_role in ('admin', 'superadmin')
          or v_gender = preferred_driver_gender
        )
    returning * into v_order;
  exception when unique_violation then
    return json_build_object('success', false, 'error', 'You already have an active job — finish or cancel it before accepting another.');
  end;

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Order already taken or not found');
  end if;

  return json_build_object('success', true, 'order_id', v_order.id);
end;
$$;
