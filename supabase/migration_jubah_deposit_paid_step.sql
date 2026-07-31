-- ============================================================
-- Give deposit bookings a real "Paid" step, matching pickup/postage
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Previously deposit bookings skipped straight from 'ordered' to 'booked'
-- on the rider/admin's Confirm Payment action, collapsing "deposit
-- received" and "confirmed" into one step — unlike pickup/postage, which
-- go 'ordered' -> 'paid' -> 'booked' as two separate steps/actions. Now all
-- three payment modes go through the same first step uniformly (see
-- src/lib/jubahStatus.ts's getJubahSteps, no longer branching on 'deposit').
--
-- Two changes to the transition logic:
-- 1. The special-case 'ordered' branch no longer needs to pick a different
--    next status per payment mode — it's always 'paid' now.
-- 2. The balance-due gate ("deposit bookings can't advance past 'booked'
--    until the balance is paid") previously only exempted a target of
--    'booked' — with 'paid' now also reachable before 'booked', it must
--    exempt both, or a deposit booking's very first payment confirmation
--    (ordered -> paid) would itself get incorrectly blocked by a balance
--    that was never due yet at that point.

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
    and (rider_id = auth.uid() or public.get_my_role() in ('admin', 'superadmin'));

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
