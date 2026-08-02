-- ============================================================
-- Migration: Remove the 'booked'/"Confirmed" status checkpoint
-- Collapses the stepper from Paid -> Confirmed -> Processing -> Collected
-- -> Delivered down to Paid -> Processing -> Collected -> Delivered.
-- 'booked' never represented anything the customer/admin/rider could act
-- on differently than 'paid' already did for non-deposit modes — for
-- deposit mode specifically, 'booked' used to be the ONLY "payment
-- confirmed" checkpoint (deposit bookings skipped 'paid' entirely,
-- ordered -> booked directly). Deposit mode now lands on 'paid' too,
-- matching pickup/postage, so the flow is identical across all three
-- payment modes going forward.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Backfill: any booking currently sitting in 'booked' becomes 'paid' — the
-- same milestone, just renamed/consolidated. Bookings already past
-- 'booked' (processing/collected/etc.) are untouched; their progress
-- doesn't depend on ever having been 'booked'.
UPDATE public.jubah_bookings SET status = 'paid' WHERE status = 'booked';

ALTER TABLE public.jubah_bookings DROP CONSTRAINT jubah_bookings_status_check;
ALTER TABLE public.jubah_bookings ADD CONSTRAINT jubah_bookings_status_check
  CHECK (status = ANY (ARRAY[
    'ordered', 'paid', 'processing', 'collected',
    'at_hub', 'picked_up', 'on_the_way', 'delivered', 'cancelled'
  ]::text[]));

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
  v_is_postage   boolean;
  v_amount_key   text;
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
    -- All three payment modes now land on 'paid' from 'ordered' — deposit
    -- mode previously jumped straight to 'booked' here, skipping 'paid'.
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

  -- Deposit bookings may reach 'paid' with the balance still outstanding
  -- (that's just the deposit itself clearing) but may not advance PAST
  -- 'paid' until the balance is settled — 'paid' is now this gate's
  -- checkpoint, replacing 'booked'.
  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'paid' then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;

  if v_is_terminal and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    v_is_postage := (v_booking.payment_mode = 'postage'
                      or (v_booking.payment_mode = 'deposit' and v_booking.delivery_address is not null));
    v_amount_key := case when v_is_postage then 'jubah_rider_commission_amount_postage'
                                            else 'jubah_rider_commission_amount_pickup' end;

    select coalesce(value::numeric, 0) into v_amount
    from public.app_settings where key = v_amount_key;

    update public.jubah_bookings
       set status = p_status,
           rider_commission_rate      = null,
           rider_commission_amount    = v_amount,
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
end;
$$;
grant execute on function public.update_jubah_booking_status(uuid, text) to authenticated;
