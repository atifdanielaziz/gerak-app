-- Customer could not cancel an accepted order at all — any attempt was
-- blocked outright with "contact them directly via WhatsApp", no matter how
-- recently the driver accepted. Mirrors the driver's own 3-minute
-- cancel_ride_order grace window: the customer now gets 5 minutes after
-- acceptance to still back out via the app before falling back to
-- WhatsApp/Call.
create or replace function public.cancel_customer_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
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

  if v_order.status = 'accepted' and now() - v_order.accepted_at > interval '5 minutes' then
    return json_build_object('success', false, 'error', 'A driver has already accepted your ride — contact them directly via WhatsApp');
  end if;

  if v_order.status not in ('pending', 'accepted') then
    return json_build_object('success', false, 'error', 'This order cannot be cancelled');
  end if;

  update public.ride_orders
    set status = 'cancelled'
    where id = p_order_id;

  return json_build_object('success', true);
end;
$$;
