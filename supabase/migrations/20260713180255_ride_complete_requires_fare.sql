-- ============================================================
-- Migration: Block completing a ride order while fare is still TBC
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

create or replace function public.update_ride_status(p_order_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_fare text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  if p_status = 'completed' then
    select fare into v_fare from public.ride_orders where id = p_order_id;
    if v_fare = 'TBC' then
      return json_build_object('success', false, 'error', 'Set the trip fare before completing.');
    end if;
  end if;

  update public.ride_orders
    set status = p_status
    where id = p_order_id
      and (driver_id = auth.uid() or v_role in ('admin', 'superadmin'));

  return json_build_object('success', true);
end;
$$;
grant execute on function public.update_ride_status(uuid, text) to authenticated;
