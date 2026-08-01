-- ============================================================
-- Jubah payment confirmation: only the assigned rider or superadmin
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Product decision: a regular admin should be view-only for Jubah booking
-- confirmations (initial payment, balance, and every status advance in
-- between) — the only people who should be able to approve are the rider
-- actually assigned to that booking (they're the one who watches for the
-- payment to land) and superadmin. Previously both update_jubah_booking_
-- status and mark_jubah_balance_paid treated 'admin' the same as
-- 'superadmin'. Removed from both. cancel_jubah_booking_admin is
-- deliberately untouched — cancellation is a separate concern from
-- approving payment progress, not part of this request.

create or replace function public.update_jubah_booking_status(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.jubah_bookings;
  v_steps   text[];
  v_cur_idx int;
  v_next    text;
begin
  select * into v_booking
  from public.jubah_bookings
  where id = p_booking_id
    and (rider_id = auth.uid() or public.get_my_role() = 'superadmin');

  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;

  -- 'ordered' is deliberately not part of the step arrays below (matching
  -- the client) — it's a special one-off transition, only ever reachable
  -- via the admin's manual "Confirm Payment" fallback for a missed webhook.
  if v_booking.status = 'ordered' then
    v_next := 'paid';
  else
    v_steps := case v_booking.payment_mode
      when 'postage' then array['paid', 'booked', 'processing', 'collected', 'at_hub']
      else                array['paid', 'booked', 'processing', 'collected', 'delivered']
    end;

    v_cur_idx := array_position(v_steps, v_booking.status);
    if v_cur_idx is null or v_cur_idx = array_length(v_steps, 1) then
      return jsonb_build_object('success', false, 'error', 'This booking cannot be advanced further.');
    end if;
    v_next := v_steps[v_cur_idx + 1];
  end if;

  if p_status <> v_next then
    return jsonb_build_object('success', false, 'error', 'Invalid status transition.');
  end if;

  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status not in ('paid', 'booked') then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;

  update public.jubah_bookings
     set status = p_status,
         initial_paid    = case when v_booking.status = 'ordered' then true else initial_paid end,
         initial_paid_at = case when v_booking.status = 'ordered' then now() else initial_paid_at end
   where id = p_booking_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.mark_jubah_balance_paid(
  p_booking_id uuid
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.jubah_bookings
    where id = p_booking_id
      and (rider_id = auth.uid() or public.get_my_role() = 'superadmin')
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;

  update public.jubah_bookings
     set balance_paid    = true,
         balance_paid_at = now()
   where id = p_booking_id
     and status <> 'cancelled';

  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or has been cancelled.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;
