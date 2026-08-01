-- ============================================================
-- Migration: driver vehicle info + customer driver card
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add vehicle columns to profiles
alter table public.profiles
  add column if not exists vehicle     text not null default '',
  add column if not exists plate_number text not null default '';

-- 2. Add driver vehicle columns to ride_orders
alter table public.ride_orders
  add column if not exists driver_vehicle text,
  add column if not exists driver_plate   text;

-- 3. Update accept_ride_order to include vehicle info + search_path fix
create or replace function public.accept_ride_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name     text;
  v_phone    text;
  v_role     text;
  v_campus   text;
  v_vehicle  text;
  v_plate    text;
  v_order    public.ride_orders;
begin
  select name, phone, role, campus, vehicle, plate_number
    into v_name, v_phone, v_role, v_campus, v_vehicle, v_plate
    from public.profiles where id = auth.uid();

  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  update public.ride_orders
    set status          = 'accepted',
        driver_id       = auth.uid(),
        driver_name     = v_name,
        driver_contact  = v_phone,
        driver_vehicle  = v_vehicle,
        driver_plate    = v_plate
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
