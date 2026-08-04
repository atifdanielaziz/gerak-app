-- cancel_ride_order releases a job back to pending but never reset the
-- fare a driver had set — a new driver picking up the released job saw a
-- leftover price with no way to change it, since the "Set Fare" UI only
-- ever renders when fare = 'TBC'. Reset it back for custom/map bookings
-- (the only modes that ever start as TBC) so the next driver gets the same
-- clean slate the first driver did. Fixed quick/aerbus fares are untouched.
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
        accepted_at    = null,
        fare           = case when book_mode in ('custom', 'map') then 'TBC' else fare end
    where id = p_order_id;

  return json_build_object('success', true);
end;
$$;
