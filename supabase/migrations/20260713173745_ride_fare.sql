-- ============================================================
-- Migration: Driver-set fare for TBC (custom/map) ride bookings
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

create or replace function public.set_ride_fare(p_order_id uuid, p_fare numeric)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ride_orders;
begin
  if p_fare is null or p_fare <= 0 then
    return json_build_object('success', false, 'error', 'Invalid fare');
  end if;

  update public.ride_orders
    set fare = p_fare::text
    where id = p_order_id
      and driver_id = auth.uid()
      and status in ('accepted', 'in_progress')
  returning * into v_order;

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Order not found or not yours');
  end if;

  return json_build_object('success', true);
end;
$$;
grant execute on function public.set_ride_fare(uuid, numeric) to authenticated;
