-- cancel_jubah_booking_customer did a plain SELECT (status='ordered') then a
-- separate UPDATE that only re-checked `id`, not status — so a rider
-- confirming the balance (mark_jubah_balance_paid, which only excludes
-- status='cancelled') around the same time as a customer cancelling could
-- leave a booking both status='cancelled' AND balance_paid=true, with no
-- refund flag and nothing surfacing this to admin. Worse, this wasn't even
-- just a millisecond race: cancel never checked balance_paid at all, so a
-- customer could cancel an already-balance-paid booking any time status was
-- still 'ordered', sequentially, no concurrency required.
--
-- Collapses the select-then-update into one atomic UPDATE (same pattern
-- mark_jubah_balance_paid already uses via `if not found`), now also
-- requiring balance_paid is not true, so cancellation and balance
-- confirmation can no longer race past each other.

create or replace function public.cancel_jubah_booking_customer(p_reference text, p_hp_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  perform public.check_jubah_rate_limit();

  update public.jubah_bookings
     set status       = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'customer'
   where reference = p_reference
     and hp_number  = p_hp_number
     and status     = 'ordered'
     and balance_paid is not true
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('success', false, 'error', 'This booking can no longer be cancelled here — please contact admin.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- Defense-in-depth: a hard guarantee at the schema level that no future code
-- path (this RPC, an admin override, a direct dashboard edit) can ever leave
-- a booking in this state, not just this one now-fixed RPC. NOT VALID so
-- this succeeds regardless of any existing rows already in that state —
-- enforced for all writes going forward, not retroactively.
alter table public.jubah_bookings
  add constraint jubah_bookings_no_paid_cancel
  check (not (status = 'cancelled' and balance_paid is true))
  not valid;
