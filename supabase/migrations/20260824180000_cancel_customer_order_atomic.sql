-- ============================================================
-- Close the select-then-update race on cancel_customer_order
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Same bug class already fixed on cancel_jubah_booking_customer
-- (20260823150000_jubah_cancel_balance_paid_race.sql): a SELECT read the
-- order's status/accepted_at, then a separate UPDATE unconditionally set
-- status='cancelled' with no re-check — a driver accepting, or the
-- 5-minute grace window lapsing, in the gap between those two statements
-- was never caught. The SELECT stays (it's what produces the specific,
-- friendly error messages — "already accepted", "can't be cancelled" —
-- worth keeping over one generic message), but the actual write is now an
-- atomic UPDATE that re-verifies the exact same conditions in its own
-- WHERE clause, so a race in that gap now just fails the UPDATE (0 rows)
-- instead of silently cancelling an order it shouldn't have.

create or replace function public.cancel_customer_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.ride_orders;
  v_updated_id uuid;
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
    where id = p_order_id
      and customer_id = auth.uid()
      and status in ('pending', 'accepted')
      and (status = 'pending' or now() - accepted_at <= interval '5 minutes')
  returning id into v_updated_id;

  if v_updated_id is null then
    return json_build_object('success', false, 'error', 'This order can no longer be cancelled here — please contact the driver directly.');
  end if;

  return json_build_object('success', true);
end;
$$;
