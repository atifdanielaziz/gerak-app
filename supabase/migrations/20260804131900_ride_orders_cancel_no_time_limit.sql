-- cancel_customer_order had a blanket 5-minute window from created_at,
-- completely independent of whether a driver had actually accepted the
-- order. Once that window passed, a customer could no longer cancel (or,
-- via MyOrders.tsx's handleEdit — which calls this same RPC as its first
-- step — edit) a booking that was still just sitting 'pending' with zero
-- driver interest. The real, meaningful protection this function already
-- has is the status = 'accepted' check just below (don't let a customer
-- yank a booking out from under a driver who already committed to it) —
-- the extra time-based cutoff didn't protect anything beyond that, it
-- just left a customer stuck with an uncancellable, unaccepted order for
-- however long it took a driver to show up or the 30-minute auto-expiry
-- (ride-orders-expire-pending) to kick in. Dropped entirely; a customer
-- can now cancel/edit their own order for as long as it's genuinely
-- still pending, same rule for both actions since they share this RPC.
create or replace function public.cancel_customer_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.ride_orders;
begin
  select * into v_order
    from public.ride_orders
    where id = p_order_id
      and customer_id = auth.uid();

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Order not found');
  end if;

  -- Block if driver already accepted
  if v_order.status = 'accepted' then
    return json_build_object('success', false, 'error', 'A driver has already accepted your ride — contact them directly via WhatsApp');
  end if;

  if v_order.status != 'pending' then
    return json_build_object('success', false, 'error', 'This order cannot be cancelled');
  end if;

  update public.ride_orders
    set status = 'cancelled'
    where id = p_order_id;

  return json_build_object('success', true);
end;
$$;
