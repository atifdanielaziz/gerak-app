-- ============================================================
-- Migration: 5-minute customer cancellation window
-- Option B: cancel blocked if driver already accepted
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

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

  -- Enforce 5-minute window
  if now() - v_order.created_at > interval '5 minutes' then
    return json_build_object('success', false, 'error', 'Cancellation window has expired');
  end if;

  -- Option B: block if driver already accepted
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
grant execute on function public.cancel_customer_order(uuid) to authenticated;
