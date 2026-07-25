-- ============================================================
-- Migration: enforce valid status transitions in update_jubah_booking_status
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Previously this RPC trusted p_status completely — it only checked that the
-- caller was authorised (the assigned rider, or admin/superadmin) and that
-- the booking wasn't cancelled, then wrote p_status verbatim. The UI always
-- computes the correct "next" status via src/lib/jubahStatus.ts's
-- getJubahProgress before calling this, so normal use was never a problem —
-- but the RPC itself is a public, authenticated endpoint. A caller invoking
-- it directly (not through the UI) could pass any string: skip straight to
-- 'delivered' with none of the actual processing steps done, or write a
-- value outside the known status set entirely, which every piece of UI that
-- indexes into the canonical step arrays would then silently treat as
-- "not started" (steps.indexOf(...) === -1).
--
-- This rewrite computes the one legitimate next status server-side — mirrors
-- getJubahSteps in src/lib/jubahStatus.ts exactly — and rejects anything
-- else, the same "server independently verifies, never trusts the client
-- for a business-critical state transition" principle applied everywhere
-- else in this schema (accept_ride_order, the ToyyibPay callback's status
-- guards, etc).
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
    v_next := case when v_booking.payment_mode = 'deposit' then 'booked' else 'paid' end;
  else
    v_steps := case v_booking.payment_mode
      when 'deposit' then array['booked', 'processing', 'collected', 'delivered']
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

  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'booked' then
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
