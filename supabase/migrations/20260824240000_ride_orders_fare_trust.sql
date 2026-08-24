-- ============================================================
-- Stop trusting client-supplied fare/night_charge on ride_orders
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Same bug class already fixed on jubah_bookings and rental_bookings —
-- never applied here. customer_insert_ride_order only checks
-- auth.uid()=customer_id, no column restriction; the direct-update
-- lock-down (20260804093000) explicitly re-grants fare/night_charge for
-- the customer's own pending-order edit. Both paths let a customer submit
-- any fare they want. Confirmed live: get_driver_earnings_leaderboard/
-- history sum this column directly, so a manipulated fare also corrupts
-- admin earnings reporting, not just the individual booking.
--
-- FIX: a BEFORE INSERT OR UPDATE trigger, not a rewritten RPC — Transport.tsx's
-- insert/update call shape stays exactly as-is, zero frontend changes, zero
-- behavior change for a legitimate booking. The trigger validates instead
-- of recomputing: 'quick' fare must match a known (pickup,destination)
-- pair, 'aerbus' fare must match the point's fare or be 'TBC' (the
-- customer editing the campus-side field client-side already forces TBC —
-- that's always allowed, not re-derived here), 'custom'/'map' must be
-- 'TBC' at the point a customer's own insert/edit reaches this trigger.
-- night_charge must match the same 00:00-06:59 window Transport.tsx's own
-- isNight check uses, computed from the already-dispatch-adjusted `time`
-- column (for AerBus, `time` is stored as the computed dispatch time, not
-- the raw ticket time — see the orderPayload comment in Transport.tsx).
--
-- Two legitimate paths bypass validation entirely, both already
-- independently authorised elsewhere:
--   - admin/superadmin direct writes (same trust level as everywhere else)
--   - a driver's own call to set_ride_fare, which sets a real numeric fare
--     on their own already-accepted TBC booking — that value is a
--     negotiated one by design, nothing to validate it against. Detected
--     by driver_id = auth.uid() and status in ('accepted','in_progress'),
--     exactly set_ride_fare's own WHERE clause.
--
-- Critical: fare/night_charge are only re-checked when actually CHANGING
-- (new IS DISTINCT FROM old), not on every update to the row. Without
-- this, accept_ride_order/update_ride_status/cancel_customer_order (which
-- never touch these columns) and the scheduled expiry/retention edge
-- functions (which run with no auth.uid() at all, so neither bypass above
-- applies to them) would re-validate an OLD row's already-stored fare on
-- every unrelated write — and if a route's price is ever changed in this
-- file later, every old booking at the previous price would then fail
-- validation on its next unrelated update (a status change, a
-- cancellation) with no way to fix it short of editing the row directly.

create or replace function public.validate_ride_order_fare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour              int;
  v_expected_night    int;
  v_quick_fare        numeric;
  v_aerbus_fare       numeric;
begin
  if public.get_my_role() in ('admin', 'superadmin') then
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.driver_id = auth.uid() and new.status in ('accepted', 'in_progress') then
    return new;
  end if;

  if (TG_OP = 'INSERT' or new.night_charge is distinct from old.night_charge)
     and new.time ~ '^\d{1,2}:'
  then
    v_hour := split_part(new.time, ':', 1)::int;
    v_expected_night := case when v_hour >= 0 and v_hour < 7 then 5 else 0 end;
    if new.night_charge <> v_expected_night then
      raise exception 'Invalid night charge.';
    end if;
  end if;

  if TG_OP = 'UPDATE' and new.fare is not distinct from old.fare then
    return new;
  end if;

  if new.book_mode in ('custom', 'map') then
    if new.fare <> 'TBC' then
      raise exception 'Invalid fare for this booking mode.';
    end if;

  elsif new.book_mode = 'quick' then
    select fare into v_quick_fare from (values
      ('DHUAM','UMP Pekan / Fakulti',10),
      ('DHUAM','Gigi Coffee / Eco Shop',7),
      ('DHUAM','Tealive / MyMama',7),
      ('DHUAM','Bandar Pekan',12),
      ('UMP Pekan / Fakulti','DHUAM',10),
      ('UMP Pekan / Fakulti','Anywhere inside UMP',5),
      ('UMP Pekan / Fakulti','Kuantan',50),
      ('UMP Pekan / Fakulti','UMP Gambang',55),
      ('UMP Pekan / Fakulti','Terminal Bas Pekan',15),
      ('UMP Pekan / Fakulti','TMG Mart Peramu',12),
      ('UMP Pekan / Fakulti','MR DIY / ECO Peramu',13),
      ('UMP Pekan / Fakulti','McDonald''s',7),
      ('UMP Pekan / Fakulti','Bowling Pekan',7),
      ('UMP Pekan / Fakulti','Pantai Selamat',10),
      ('UMP Pekan / Fakulti','Kawasan Mentiga',10),
      ('UMP Pekan / Fakulti','Pantai Lagenda',8),
      ('UMP Pekan / Fakulti','Taman Beruas Jaya',7),
      ('Taman Beruas','Bandar Pekan',18),
      ('UMP Gambang','Anywhere inside UMP',5),
      ('UMP Gambang','Court Prima (KK4)',5),
      ('UMP Gambang','7E / Petron / Baroqah Laundry',6),
      ('UMP Gambang','Bus Stop UMP',6),
      ('UMP Gambang','Pasar Malam / Caltex / TMG / Tasik Paya Besar',7),
      ('UMP Gambang','Taman Prima',7),
      ('UMP Gambang','Marrybrown',7),
      ('UMP Gambang','Suraya',8),
      ('UMP Gambang','Gambang Jaya',8),
      ('UMP Gambang','Mr. DIY',9),
      ('UMP Gambang','Gambang Damai',15),
      ('UMP Gambang','Jaya Gading',15),
      ('UMP Gambang','Taman Tas',18),
      ('UMP Gambang','McDonald''s Sg. Isap',24),
      ('UMP Gambang','Air Terjun Pandan',27),
      ('UMP Gambang','ECM / KCM',32),
      ('UMP Gambang','Pantai Kempadang',34),
      ('UMP Gambang','IM (IIUM Kuantan)',35),
      ('UMP Gambang','Teluk Cempedak',35),
      ('UMP Gambang','Pantai Sepat',42),
      ('UMP Gambang','Pantai Balok',45),
      ('UMP Gambang','Pekan',60),
      ('CFS IIUM Gambang','Bus Stop UMP',11),
      ('CFS IIUM Gambang','Taman Tas',22),
      ('CFS IIUM Gambang','IIUM Kuantan',37),
      ('CFS IIUM Gambang','ECM / KCM',37),
      ('CFS IIUM Gambang','Teluk Cempedak',39)
    ) as r(from_pt, to_pt, fare)
    where r.from_pt = new.pickup and r.to_pt = new.destination;

    if v_quick_fare is null or new.fare <> v_quick_fare::text then
      raise exception 'Invalid fare for this route.';
    end if;

  elsif new.book_mode = 'aerbus' then
    if new.fare <> 'TBC' then
      select fare into v_aerbus_fare from (values
        ('Pekan','airport',40),
        ('Pekan','tsk',45),
        ('Pekan','pekan_bus',15),
        ('Gambang','airport',18),
        ('Gambang','tsk',28)
      ) as a(campus_label, point_id, fare)
      where a.campus_label = new.campus and a.point_id = new.aerbus_point;

      if v_aerbus_fare is null or new.fare <> v_aerbus_fare::text then
        raise exception 'Invalid fare for this AerBus point.';
      end if;
    end if;

  else
    -- Unrecognised book_mode — fail closed rather than silently skipping
    -- validation for a value none of the branches above account for.
    raise exception 'Invalid booking mode.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_ride_order_fare on public.ride_orders;
create trigger validate_ride_order_fare
  before insert or update on public.ride_orders
  for each row
  execute function public.validate_ride_order_fare();
