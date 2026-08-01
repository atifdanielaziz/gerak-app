-- ============================================================
-- Migration: 3-minute cancellation window for accepted jobs
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add accepted_at timestamp to ride_orders
alter table public.ride_orders
  add column if not exists accepted_at timestamptz;

-- 2. Update accept_ride_order to stamp accepted_at
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

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Order already taken or not found');
  end if;

  return json_build_object('success', true, 'order_id', v_order.id);
end;
$$;
grant execute on function public.accept_ride_order(uuid) to authenticated;

-- 3. Cancel RPC — only within 3 minutes of accepted_at
create or replace function public.cancel_ride_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ride_orders;
  v_role  text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  select * into v_order from public.ride_orders
    where id = p_order_id
      and driver_id = auth.uid()
      and status = 'accepted';

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Job not found or already in progress');
  end if;

  -- Enforce 3-minute window
  if now() - v_order.accepted_at > interval '3 minutes' then
    return json_build_object('success', false, 'error', 'Cancellation window has expired');
  end if;

  -- Release job back to pool
  update public.ride_orders
    set status         = 'pending',
        driver_id      = null,
        driver_name    = null,
        driver_contact = null,
        accepted_at    = null
    where id = p_order_id;

  return json_build_object('success', true);
end;
$$;
grant execute on function public.cancel_ride_order(uuid) to authenticated;
