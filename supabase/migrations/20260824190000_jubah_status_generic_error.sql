-- ============================================================
-- Add generic-error handling to update_jubah_booking_status
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- No exception block at all on the previous version — a constraint
-- violation on the final UPDATE (e.g. jubah_bookings_no_paid_cancel, or
-- any future check constraint) would propagate as a raw Postgres error to
-- whichever rider/admin triggered it, instead of the codebase's own
-- {success, error} convention. Same fix already applied to
-- create_jubah_booking/create_rental_booking: raise warning server-side,
-- generic message to the client. Body otherwise byte-identical to the
-- current live version (20260809000000).

create or replace function public.update_jubah_booking_status(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking      public.jubah_bookings;
  v_steps        text[];
  v_cur_idx      int;
  v_next         text;
  v_is_terminal  boolean := false;
  v_delivery_type text;
  v_amount       numeric;
begin
  select * into v_booking
  from public.jubah_bookings
  where id = p_booking_id
    and (rider_id = auth.uid() or public.get_my_role() in ('admin', 'superadmin'));

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
      when 'postage' then array['paid', 'processing', 'collected', 'at_hub']
      else                array['paid', 'processing', 'collected', 'delivered']
    end;

    v_cur_idx := array_position(v_steps, v_booking.status);
    if v_cur_idx is null or v_cur_idx = array_length(v_steps, 1) then
      return jsonb_build_object('success', false, 'error', 'This booking cannot be advanced further.');
    end if;
    v_next := v_steps[v_cur_idx + 1];
    v_is_terminal := (v_cur_idx + 1 = array_length(v_steps, 1));
  end if;

  if p_status <> v_next then
    return jsonb_build_object('success', false, 'error', 'Invalid status transition.');
  end if;

  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'paid' then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;

  if v_is_terminal and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    v_delivery_type := case when (v_booking.payment_mode = 'postage'
                                   or (v_booking.payment_mode = 'deposit' and v_booking.delivery_address is not null))
                        then 'postage' else 'pickup' end;

    select coalesce(amount, 0) into v_amount
    from public.jubah_rider_commission
    where delivery_type = v_delivery_type and university = v_booking.university_key;

    update public.jubah_bookings
       set status = p_status,
           rider_commission_rate      = null,
           rider_commission_amount    = coalesce(v_amount, 0),
           rider_commission_earned_at = now()
     where id = p_booking_id;
  else
    update public.jubah_bookings
       set status = p_status,
           initial_paid    = case when v_booking.status = 'ordered' then true else initial_paid end,
           initial_paid_at = case when v_booking.status = 'ordered' then now() else initial_paid_at end
     where id = p_booking_id;
  end if;

  return jsonb_build_object('success', true);
exception when others then
  raise warning 'update_jubah_booking_status failed: % (sqlstate %)', sqlerrm, sqlstate;
  return jsonb_build_object('success', false, 'error', 'Something went wrong updating this booking. Please try again, or contact admin if this keeps happening.');
end;
$$;
