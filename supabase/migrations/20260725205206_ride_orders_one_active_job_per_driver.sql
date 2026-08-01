-- ============================================================
-- Migration: prevent a driver from holding two active ride jobs at once
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- ROOT CAUSE (verified against the live RPC, not assumed):
-- accept_ride_order's UPDATE only guards the row being accepted
-- (`status = 'pending'`) — it never checks whether the accepting driver
-- (auth.uid()) already holds another job in 'accepted'/'in_progress'.
-- Two different pending orders are two different rows, so nothing stops
-- the same driver's two near-simultaneous accept calls (multi-tab, a slow
-- reload, or a fast double-tap on two different pool cards before the UI
-- re-renders and disables the buttons) from both succeeding.
--
-- CONSEQUENCE (verified against the live loadOrders query): the "my
-- active job" fetch is `.eq('driver_id', uid).in('status',
-- ['accepted','in_progress']).order('created_at', desc).limit(1).single()`
-- — ordered by the ORIGINAL ride's creation time, not acceptance time. If
-- a driver ends up with two active rows, only one is ever shown as
-- `myJob`; the other still has driver_id set and blocks that customer's
-- order from anyone else accepting it, but never gets a Start/Complete/
-- Cancel action rendered anywhere — a customer's ride silently stranded.
--
-- FIX: a partial unique index — Postgres refuses, atomically, to let a
-- second row reach an active status for a driver who already has one.
-- Simpler than the rental-booking fix (no time ranges involved): this is
-- a "the same driver can't hold two active rows" constraint, not a
-- "no two rows may overlap in time" one.

-- Confirmed no pre-existing violation before adding this (see chat) — 0
-- drivers currently hold more than one accepted/in_progress row.
create unique index if not exists ride_orders_one_active_job_per_driver
  on public.ride_orders (driver_id)
  where status in ('accepted', 'in_progress');

-- Proactive check added to accept_ride_order too, not just relying on the
-- index: gives a clear, expected business-rule error ("you already have
-- an active job") in the common non-race case, while the index above
-- remains the actual atomic guarantee under real concurrency (this check
-- and the UPDATE below are still two separate statements, so on their own
-- they'd have exactly the same TOCTOU gap the index closes).
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
  v_order   public.ride_orders;
begin
  select name, phone, role, campus
    into v_name, v_phone, v_role, v_campus
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
    returning * into v_order;
  exception when unique_violation then
    -- The race the proactive check above couldn't catch: another accept
    -- by this same driver committed in the gap between that check and
    -- this UPDATE. The index caught it instead — same friendly message.
    return json_build_object('success', false, 'error', 'You already have an active job — finish or cancel it before accepting another.');
  end;

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Order already taken or not found');
  end if;

  return json_build_object('success', true, 'order_id', v_order.id);
end;
$$;
