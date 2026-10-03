-- Rider commission was only ever stamped at the terminal status
-- ('delivered'), so nothing showed in the Earnings tab until a booking was
-- fully done — riders wanted it to count as soon as a booking reaches
-- 'processing' instead, since that's when the robe has actually left their
-- hands for processing.
--
-- cancel_jubah_booking_admin allows cancelling from ANY status except
-- 'cancelled'/'delivered' — including 'processing' and 'collected' — so
-- moving the earn-point earlier creates a real risk: a booking could earn
-- commission at 'processing' and then still get cancelled later, leaving
-- the rider's total inflated with money for an order that never completed.
-- Fixed by reversing the commission on cancel.

-- Earn at 'processing' instead of the terminal status.
create or replace function public.update_jubah_booking_status(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_booking public.jubah_bookings;
  v_steps text[];
  v_cur_idx int;
  v_next text;
  v_delivery_type text;
  v_amount numeric;
begin
  select * into v_booking from public.jubah_bookings
  where id = p_booking_id
    and (
      rider_id = auth.uid()
      or public.get_my_role() in ('admin', 'superadmin')
      or public.jubah_lead_can_manage_university(university_key)
    );
  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if v_booking.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;
  if v_booking.status = 'ordered' then
    v_next := 'paid';
  else
    v_steps := case v_booking.payment_mode
      when 'deposit' then array['paid', 'processing', 'collected', 'delivered']
      when 'postage' then array['paid', 'processing', 'collected', 'delivered']
      else array['paid', 'processing', 'collected', 'delivered'] end;
    v_cur_idx := array_position(v_steps, v_booking.status);
    if v_cur_idx is null or v_cur_idx = array_length(v_steps, 1) then
      return jsonb_build_object('success', false, 'error', 'This booking cannot be advanced further.');
    end if;
    v_next := v_steps[v_cur_idx + 1];
  end if;
  if p_status <> v_next then
    return jsonb_build_object('success', false, 'error', 'Invalid status transition.');
  end if;
  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'paid' then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;
  if p_status = 'processing' and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    v_delivery_type := case when (v_booking.payment_mode = 'postage'
      or (v_booking.payment_mode = 'deposit' and v_booking.delivery_address is not null))
      then 'postage' else 'pickup' end;
    select coalesce(amount, 0) into v_amount
      from public.jubah_rider_commission
      where delivery_type = v_delivery_type and university = v_booking.university_key;
    update public.jubah_bookings set
      status = p_status,
      rider_commission_rate = null,
      rider_commission_amount = coalesce(v_amount, 0),
      rider_commission_earned_at = now()
      where id = p_booking_id;
  else
    update public.jubah_bookings set
      status = p_status,
      initial_paid = case when v_booking.status = 'ordered' then true else initial_paid end,
      initial_paid_at = case when v_booking.status = 'ordered' then now() else initial_paid_at end
      where id = p_booking_id;
  end if;
  return jsonb_build_object('success', true);
exception when others then
  raise warning 'update_jubah_booking_status failed: % (sqlstate %)', sqlerrm, sqlstate;
  return jsonb_build_object('success', false, 'error', 'Something went wrong updating this booking. Please try again, or contact admin if this keeps happening.');
end;
$$;

-- Reverse commission on cancel — a booking cancelled after already earning
-- (now possible as early as 'processing', not just 'collected') must not
-- leave stale commission on record; the unconditional reset here is a
-- no-op for bookings that never earned anything.
create or replace function public.cancel_jubah_booking_admin(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role text := public.get_my_role();
begin
  if not exists (
    select 1 from public.jubah_bookings b
    where b.id = p_booking_id
      and (
        b.rider_id = auth.uid()
        or v_role in ('admin', 'superadmin')
        or public.jubah_lead_can_manage_university(b.university_key)
      )
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  update public.jubah_bookings
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by = case
           when v_role in ('admin', 'superadmin') then v_role
           when public.is_active_jubah_lead() then 'jubah_lead'
           else 'rider' end,
         rider_commission_amount = null,
         rider_commission_rate = null,
         rider_commission_earned_at = null
   where id = p_booking_id and status not in ('cancelled', 'delivered');
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or cannot be cancelled from its current status.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- Estimated earnings — the rider's own bookings not yet at 'processing'
-- (so not yet earning anything confirmed), with a live projection of what
-- each would pay out based on the current jubah_rider_commission rates.
-- Never written to jubah_bookings; purely computed for display.
create or replace function public.get_rider_jubah_estimated_earnings()
returns table(
  reference text, remark text, payment_mode text, is_postage boolean,
  order_value numeric, estimated_amount numeric
)
language sql
security definer
set search_path to 'public'
as $$
  select
    jb.reference, jb.remark, jb.payment_mode,
    (jb.payment_mode = 'postage' or (jb.payment_mode = 'deposit' and jb.delivery_address is not null)) as is_postage,
    jb.cost + coalesce(jb.balance_due, 0) as order_value,
    coalesce(jrc.amount, 0) as estimated_amount
  from public.jubah_bookings jb
  left join public.jubah_rider_commission jrc
    on jrc.delivery_type = (case when (jb.payment_mode = 'postage'
         or (jb.payment_mode = 'deposit' and jb.delivery_address is not null))
         then 'postage' else 'pickup' end)
    and jrc.university = jb.university_key
  where jb.rider_id = auth.uid()
    and jb.status in ('ordered', 'paid')
  order by jb.created_at desc;
$$;
