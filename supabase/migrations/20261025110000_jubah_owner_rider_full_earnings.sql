-- ============================================================
-- Migration: Owner riders' Earnings = full amount paid
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Owner's decision: riders who are paid directly into their own account
-- (an active row in jubah_payees — Adib and Atif) keep the whole booking
-- amount, so their Earnings show what the customer actually paid, counted
-- as soon as the payment is confirmed (no need to reach Processing):
--   earned    = first payment (cost), plus the deposit balance once paid;
--   estimated = still to come: an unconfirmed booking's full value, or a
--               deposit's unpaid balance.
-- Every other rider keeps the flat per-booking commission, unchanged.
-- Return shapes are unchanged, so the Rider Hub code keeps working.

create or replace function public.jubah_is_owner_rider(p_rider_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$ select exists (select 1 from public.jubah_payees where rider_id = p_rider_id and is_active); $$;
revoke all on function public.jubah_is_owner_rider(uuid) from public, anon;
grant execute on function public.jubah_is_owner_rider(uuid) to authenticated;

create or replace function public.get_rider_jubah_earnings()
returns table(reference text, remark text, payment_mode text, is_postage boolean, order_value numeric, rider_commission_rate numeric, rider_commission_amount numeric, earned_at timestamp with time zone)
language sql security definer
set search_path to 'public'
as $$
  -- Owner riders: the full amount paid so far.
  select
    jb.reference, jb.remark, jb.payment_mode,
    (jb.payment_mode = 'postage' or (jb.payment_mode = 'deposit' and jb.delivery_address is not null)),
    jb.cost + coalesce(jb.balance_due, 0),
    null::numeric,
    jb.cost + case when jb.payment_mode = 'deposit' and coalesce(jb.balance_paid, false) then coalesce(jb.balance_due, 0) else 0 end,
    coalesce(case when jb.payment_mode = 'deposit' and jb.balance_paid then jb.balance_paid_at end, jb.initial_paid_at, jb.created_at)
  from public.jubah_bookings jb
  where public.jubah_is_owner_rider(auth.uid())
    and jb.rider_id = auth.uid()
    and jb.status <> 'cancelled'
    and jb.initial_paid
  union all
  -- Everyone else: the stamped commission, as before.
  select
    jb.reference, jb.remark, jb.payment_mode,
    (jb.payment_mode = 'postage' or (jb.payment_mode = 'deposit' and jb.delivery_address is not null)),
    jb.cost + coalesce(jb.balance_due, 0),
    jb.rider_commission_rate, jb.rider_commission_amount, jb.rider_commission_earned_at
  from public.jubah_bookings jb
  where not public.jubah_is_owner_rider(auth.uid())
    and jb.rider_id = auth.uid()
    and jb.rider_commission_amount is not null
  order by 8 desc;
$$;

create or replace function public.get_rider_jubah_estimated_earnings()
returns table(reference text, remark text, payment_mode text, is_postage boolean, order_value numeric, estimated_amount numeric)
language sql security definer
set search_path to 'public'
as $$
  -- Owner riders: money still to come.
  select
    jb.reference, jb.remark, jb.payment_mode,
    (jb.payment_mode = 'postage' or (jb.payment_mode = 'deposit' and jb.delivery_address is not null)),
    jb.cost + coalesce(jb.balance_due, 0),
    case when not jb.initial_paid then jb.cost + coalesce(jb.balance_due, 0) else coalesce(jb.balance_due, 0) end
  from public.jubah_bookings jb
  where public.jubah_is_owner_rider(auth.uid())
    and jb.rider_id = auth.uid()
    and jb.status <> 'cancelled'
    and (not jb.initial_paid or (jb.payment_mode = 'deposit' and not coalesce(jb.balance_paid, false)))
  union all
  -- Everyone else: projected commission, as before.
  select
    jb.reference, jb.remark, jb.payment_mode,
    (jb.payment_mode = 'postage' or (jb.payment_mode = 'deposit' and jb.delivery_address is not null)),
    jb.cost + coalesce(jb.balance_due, 0),
    coalesce(jrc.amount, 0)
  from public.jubah_bookings jb
  left join public.jubah_rider_commission jrc
    on jrc.delivery_type = (case when (jb.payment_mode = 'postage'
         or (jb.payment_mode = 'deposit' and jb.delivery_address is not null))
         then 'postage' else 'pickup' end)
    and jrc.university = jb.university_key
  where not public.jubah_is_owner_rider(auth.uid())
    and jb.rider_id = auth.uid()
    and jb.status in ('ordered', 'paid')
    and jb.rider_commission_amount is null;
$$;
