-- ============================================================
-- Stop trusting client-supplied price on rental bookings + lock down
-- direct UPDATE access (same bug classes already fixed on jubah_bookings)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- PROBLEM 1 (price trust): GerakRental.tsx's handleBook() computes
-- totalPrice client-side (price_hour * hours + night surcharge) and
-- inserts it directly into rental_bookings.total_price via a raw
-- .insert() call — anyone could intercept the request and set any price.
-- Same class of bug already fixed on jubah_bookings in
-- 20260721234036_jubah_booking_price_trust.sql.
--
-- FIX: a new SECURITY DEFINER RPC recomputes total_price server-side from
-- rental_vehicles (price_hour, operating_start/end, night_surcharge_on/
-- rate) using the exact same formula GerakRental.tsx already uses for
-- display (calcNightSurcharge's half-hour-slot loop, totalHours logic).
-- The direct INSERT grant is revoked so this RPC becomes the only way to
-- create a booking — it's SECURITY DEFINER so it still works for every
-- real user despite the grant being gone. The 23P01 (exclusion_violation)
-- race-detection GerakRental.tsx relies on for "slot just taken by someone
-- else" is preserved by catching that specific SQLSTATE and returning it
-- as a `code` in the response, same pattern create_jubah_booking uses for
-- duplicate references.
--
-- PROBLEM 2 (direct-update re-pricing): the "customer updates own pending"
-- and "owner updates" policies have no column restriction at all, so
-- either party could silently rewrite total_price (or any other column)
-- on a booking via raw REST. Verified via grep: the only direct .update()
-- calls in the app are a customer canceling their own booking (`{status:
-- 'cancelled'}`), a customer uploading their license (`{license_url}`),
-- and an owner changing status (`{status}`) — nothing else needs direct
-- write access. Column grant narrowed to exactly those two columns.

-- 1) Server-computed pricing RPC
create or replace function public.create_rental_booking(
  p_owner_id     uuid,
  p_date         date,
  p_end_date     date,
  p_booking_type text,
  p_start_hour   numeric,
  p_duration     numeric,
  p_persons      int,
  p_notes        text default ''
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_customer_id     uuid := auth.uid();
  v_owner           public.rental_vehicles%rowtype;
  v_start_hour      numeric;
  v_total_hours     numeric;
  v_night_surcharge numeric := 0;
  v_num_days        int;
  v_total_price     numeric;
  v_half            numeric;
  v_hour            numeric;
  v_booking_id      uuid;
begin
  if v_customer_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated.');
  end if;

  if p_booking_type not in ('hourly', 'fullday') then
    return jsonb_build_object('success', false, 'error', 'Invalid booking type.');
  end if;

  select * into v_owner from public.rental_vehicles where owner_id = p_owner_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Vehicle not found.');
  end if;

  if p_booking_type = 'hourly' then
    if p_start_hour is null or p_duration is null or p_duration <= 0 then
      return jsonb_build_object('success', false, 'error', 'Invalid time selection.');
    end if;
    v_start_hour  := p_start_hour;
    v_total_hours := p_duration;

    if v_owner.night_surcharge_on and v_owner.night_surcharge_rate > 0 then
      v_half := 0;
      while v_half < p_duration loop
        v_hour := (p_start_hour + v_half)::numeric % 24;
        if v_hour >= 22 or v_hour < 5 then
          v_night_surcharge := v_night_surcharge + 0.5 * v_owner.night_surcharge_rate;
        end if;
        v_half := v_half + 0.5;
      end loop;
    end if;
  else
    -- Full-day: start hour is always the vehicle's own operating start,
    -- never client-supplied — mirrors GerakRental.tsx's own bookStart logic.
    v_start_hour := v_owner.operating_start;
    v_num_days   := (coalesce(p_end_date, p_date) - p_date) + 1;
    if v_num_days < 1 then
      return jsonb_build_object('success', false, 'error', 'Invalid date range.');
    end if;
    v_total_hours := v_num_days * (v_owner.operating_end - v_owner.operating_start);
  end if;

  v_total_price := v_owner.price_hour * v_total_hours + v_night_surcharge;

  insert into public.rental_bookings (
    owner_id, customer_id, date, end_date, booking_type,
    start_hour, duration, persons, total_price, notes
  ) values (
    p_owner_id, v_customer_id, p_date, coalesce(p_end_date, p_date), p_booking_type,
    v_start_hour,
    case when p_booking_type = 'fullday' then v_total_hours else p_duration end,
    p_persons, v_total_price, coalesce(p_notes, '')
  ) returning id into v_booking_id;

  return jsonb_build_object('success', true, 'id', v_booking_id, 'total_price', v_total_price);
exception
  when sqlstate '23P01' then
    return jsonb_build_object('success', false, 'error', 'That slot was just booked by someone else.', 'code', '23P01');
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.create_rental_booking(uuid, date, date, text, numeric, numeric, int, text) to authenticated;

-- 2) Close the direct-insert bypass — the RPC above is SECURITY DEFINER
--    and keeps working for every real user regardless of this revoke.
drop policy if exists "customer creates" on public.rental_bookings;
revoke insert on public.rental_bookings from authenticated, anon;

-- 3) Narrow direct UPDATE access to exactly the two columns real app code
--    writes directly (self-cancel / license upload / owner status change).
--    Row-level scoping (own booking, own vehicle) is unchanged.
revoke update on public.rental_bookings from authenticated, anon;
grant update (status, license_url) on public.rental_bookings to authenticated;

drop policy if exists "customer updates own pending" on public.rental_bookings;
create policy "customer updates own pending"
  on public.rental_bookings for update
  using (auth.uid() = customer_id and status = 'pending')
  with check (auth.uid() = customer_id and status in ('pending', 'cancelled'));
