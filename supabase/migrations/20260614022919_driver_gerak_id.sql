-- ============================================================
-- Migration: store driver_gerak_id in ride_orders
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add the column
alter table public.ride_orders
  add column if not exists driver_gerak_id text;

-- 2. Re-create accept_ride_order to capture gerak_id
create or replace function public.accept_ride_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_phone     text;
  v_role      text;
  v_campus    text;
  v_vehicle   text;
  v_plate     text;
  v_gerak_id  text;
  v_order     public.ride_orders;
begin
  select name, phone, role, campus, vehicle, plate_number, gerak_id
    into v_name, v_phone, v_role, v_campus, v_vehicle, v_plate, v_gerak_id
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
        driver_plate    = v_plate,
        driver_gerak_id = v_gerak_id
    where id = p_order_id
      and status = 'pending'
      and (v_role = 'superadmin' or lower(campus) = lower(v_campus))
  returning * into v_order;

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Order already taken or not found');
  end if;

  return json_build_object('success', true, 'order_id', v_order.id);
end;
$$;
