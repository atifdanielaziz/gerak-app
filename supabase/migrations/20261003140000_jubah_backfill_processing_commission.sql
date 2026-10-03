-- One-time backfill: bookings that already reached 'processing'/'collected'/
-- 'delivered' BEFORE the previous migration (jubah_earnings_at_processing)
-- never got rider_commission_amount stamped — that migration only changed
-- the trigger point for FUTURE status transitions, it doesn't retroactively
-- fix bookings already sitting in those statuses. Confirmed live: 39
-- 'processing' bookings across 2 riders had rider_commission_amount still
-- null right after deploying that migration.
--
-- Idempotent via the same `rider_commission_amount is null` guard the RPC
-- itself uses — safe to re-run, and naturally skips anything already
-- stamped (by this backfill or by a normal transition since).
update public.jubah_bookings jb
set
  rider_commission_amount = coalesce((
    select amount from public.jubah_rider_commission jrc
    where jrc.delivery_type = (case when (jb.payment_mode = 'postage'
        or (jb.payment_mode = 'deposit' and jb.delivery_address is not null))
        then 'postage' else 'pickup' end)
      and jrc.university = jb.university_key
  ), 0),
  rider_commission_rate = null,
  rider_commission_earned_at = now()
where jb.rider_id is not null
  and jb.status in ('processing', 'collected', 'delivered')
  and jb.rider_commission_amount is null;
