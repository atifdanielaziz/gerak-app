-- Superadmin-facing counterpart to get_rider_jubah_earnings() (which is
-- hardcoded to auth.uid(), so a rider can only ever see their own numbers)
-- — lets an admin look up ANY rider's Jubah commission earnings, same data
-- shape, just parameterized and permission-gated instead of self-scoped.
-- Mirrors get_driver_earnings_leaderboard/get_driver_earnings_history's
-- existing pattern for Gerak Car, kept as its own pair of functions rather
-- than bolted onto those — Jubah commission is a flat RM per completed
-- order with no "TBC"/night-charge concept, so forcing it into that
-- shape would do more harm than sharing code is worth.

create or replace function public.get_jubah_rider_earnings_leaderboard(p_start_date text default null, p_end_date text default null)
returns table (rider_id uuid, name text, gerak_id text, campus text, total_earnings numeric, completed_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.get_my_role() != 'superadmin' then
    raise exception 'Insufficient permissions';
  end if;
  return query
    select
      p.id, p.name, p.gerak_id, p.campus,
      coalesce(sum(jb.rider_commission_amount), 0) as total_earnings,
      count(*) as completed_count
    from public.profiles p
    join public.jubah_bookings jb on jb.rider_id = p.id and jb.rider_commission_amount is not null
    where (p_start_date is null or jb.rider_commission_earned_at::date >= p_start_date::date)
      and (p_end_date   is null or jb.rider_commission_earned_at::date <= p_end_date::date)
    group by p.id, p.name, p.gerak_id, p.campus
    order by total_earnings desc;
end;
$$;

create or replace function public.get_jubah_rider_earnings_history(p_rider_id uuid)
returns table (reference text, remark text, payment_mode text, is_postage boolean, order_value numeric, rider_commission_rate numeric, rider_commission_amount numeric, earned_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.get_my_role() != 'superadmin' then
    raise exception 'Insufficient permissions';
  end if;
  return query
    select
      jb.reference, jb.remark, jb.payment_mode,
      (jb.payment_mode = 'postage' or (jb.payment_mode = 'deposit' and jb.delivery_address is not null)) as is_postage,
      jb.cost + coalesce(jb.balance_due, 0) as order_value,
      jb.rider_commission_rate, jb.rider_commission_amount, jb.rider_commission_earned_at
    from public.jubah_bookings jb
    where jb.rider_id = p_rider_id
      and jb.rider_commission_amount is not null
    order by jb.rider_commission_earned_at desc;
end;
$$;

revoke all on function public.get_jubah_rider_earnings_leaderboard(text, text) from public, anon;
grant execute on function public.get_jubah_rider_earnings_leaderboard(text, text) to authenticated;
revoke all on function public.get_jubah_rider_earnings_history(uuid) from public, anon;
grant execute on function public.get_jubah_rider_earnings_history(uuid) to authenticated;
