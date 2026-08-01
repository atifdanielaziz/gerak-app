-- ============================================================
-- Migration: Driver earnings analytics (superadmin only)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Leaderboard: all-time earnings per driver, ranked highest to lowest.
--    Inner join means only drivers with >=1 completed ride appear —
--    the row count of this result is itself "how many drivers have earned so far".
create or replace function public.get_driver_earnings_leaderboard()
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
    group by p.id, p.name, p.gerak_id, p.campus
    order by total_earnings desc;
end;
$$;
grant execute on function public.get_driver_earnings_leaderboard() to authenticated;

-- 2. One driver's full completed-ride history (no row cap, unlike the
--    driver's own DriverHome view) — used for the admin drill-in detail,
--    reduced client-side month-by-month exactly like DriverHome does.
create or replace function public.get_driver_earnings_history(p_driver_id uuid)
returns table (
  date         text,
  fare         text,
  night_charge integer,
  status       text
)
language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() != 'superadmin' then
    raise exception 'Insufficient permissions';
  end if;
  return query
    select o.date, o.fare, o.night_charge, o.status
    from public.ride_orders o
    where o.driver_id = p_driver_id and o.status = 'completed';
end;
$$;
grant execute on function public.get_driver_earnings_history(uuid) to authenticated;
