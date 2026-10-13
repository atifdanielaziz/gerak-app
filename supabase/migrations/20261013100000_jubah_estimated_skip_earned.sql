-- ============================================================
-- Migration: Don't double-count already-earned Jubah commission
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Commission is stamped when a booking first reaches 'processing' and is
-- kept if the booking is later moved back to 'paid' (e.g. so the customer
-- can replace a document). The estimate list only looked at status, so
-- such a booking showed up as both earned and estimated. Skip rows that
-- already have a stamped commission.

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
    and jb.rider_commission_amount is null
  order by jb.created_at desc;
$$;
