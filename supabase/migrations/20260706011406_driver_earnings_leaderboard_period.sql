-- ============================================================
-- Migration: Period filtering (day/week/month/all-time) for the
--            driver earnings leaderboard
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Must drop the existing zero-arg function first — create or replace with
-- new parameters would create an ambiguous overload rather than replace it.
drop function if exists public.get_driver_earnings_leaderboard();

create or replace function public.get_driver_earnings_leaderboard(
  p_start_date text default null,
  p_end_date   text default null
)
returns table (
  driver_id       uuid,
  name            text,
  gerak_id        text,
  campus          text,
  total_earnings  numeric,
  completed_count bigint,
  cash_count      bigint,
  tbc_count       bigint
)
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() != 'superadmin' then
    raise exception 'Insufficient permissions';
  end if;
  return query
    select
      p.id, p.name, p.gerak_id, p.campus,
      coalesce(sum(case when o.fare != 'TBC' then o.fare::numeric + o.night_charge else 0 end), 0) as total_earnings,
      count(*) filter (where o.status = 'completed')                    as completed_count,
      count(*) filter (where o.status = 'completed' and o.fare != 'TBC') as cash_count,
      count(*) filter (where o.status = 'completed' and o.fare = 'TBC')  as tbc_count
    from public.profiles p
    join public.ride_orders o on o.driver_id = p.id and o.status = 'completed'
    where p.role = 'driver'
      and (p_start_date is null or o.date >= p_start_date)
      and (p_end_date   is null or o.date <= p_end_date)
    group by p.id, p.name, p.gerak_id, p.campus
    order by total_earnings desc;
end;
$$;
grant execute on function public.get_driver_earnings_leaderboard(text, text) to authenticated;
