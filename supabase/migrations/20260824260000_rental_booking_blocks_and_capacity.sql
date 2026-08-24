-- ============================================================
-- create_rental_booking: reject bookings against an owner's blocked
-- dates/hours, and validate passenger count server-side
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- FINDING 1 — owner blocks bypassable: rental_blocks (an owner's
-- maintenance/personal-use dates, set via DriverHome.tsx's
-- toggleHourBlock/blockFullDay) was only ever read client-side for the
-- calendar UI. create_rental_booking never checked it, so a customer
-- could book a slot the owner explicitly marked unavailable. Same
-- half-hour-slot representation the existing GiST exclusion constraint
-- (20260725204420) uses for booking-vs-booking overlap, applied here as
-- an explicit check instead of folding into that constraint — blocks are
-- stored as (owner, date) -> whole-hour int[] (DriverHome.tsx's HOURS is
-- whole-hour granularity, distinct from GerakRental.tsx's half-hour
-- booking granularity), a genuinely different shape than a booking's own
-- range, not worth forcing into the same GiST family.
--   - blocked_hours = '{}' is the app's own established convention for
--     "the entire day is blocked" (see DriverHome.tsx's comment on
--     toggleHourBlock/blockFullDay) — not "nothing blocked".
--   - A non-empty blocked_hours lists specific WHOLE hours blocked; a
--     booking's occupied window is [start_hour, start_hour+duration]
--     inclusive (matching the exclusion constraint's own documented
--     semantics) — overlaps if any blocked whole-hour's [h, h+1) window
--     intersects that.
--   - A fullday booking needs every day in its range completely free —
--     any block at all (empty-array or specific hours) on any touched
--     date rejects it.
--
-- FINDING 2 — persons unvalidated: p_persons had zero server-side bound,
-- only a client-side clamp trivially bypassed via direct RPC call. Now
-- validated against the vehicle's own seats.
--
-- Full body otherwise unchanged from 20260824170000 (the current
-- authoritative version, which already fixed the sqlerrm leak).

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
  v_block           record;
  v_check_date      date;
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

  if p_persons is null or p_persons < 1 or p_persons > coalesce(v_owner.seats, 999) then
    return jsonb_build_object('success', false, 'error', 'Invalid passenger count for this vehicle.');
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

    select * into v_block from public.rental_blocks where owner_id = p_owner_id and date = p_date;
    if found then
      if array_length(v_block.blocked_hours, 1) is null then
        return jsonb_build_object('success', false, 'error', 'This owner has blocked this date.');
      end if;
      if exists (
        select 1 from unnest(v_block.blocked_hours) as h
        where h < (p_start_hour + p_duration) and (h + 1) > p_start_hour
      ) then
        return jsonb_build_object('success', false, 'error', 'This time slot is blocked by the owner.');
      end if;
    end if;
  else
    v_start_hour := v_owner.operating_start;
    v_num_days   := (coalesce(p_end_date, p_date) - p_date) + 1;
    if v_num_days < 1 then
      return jsonb_build_object('success', false, 'error', 'Invalid date range.');
    end if;
    v_total_hours := v_num_days * (v_owner.operating_end - v_owner.operating_start);

    v_check_date := p_date;
    while v_check_date <= coalesce(p_end_date, p_date) loop
      if exists (select 1 from public.rental_blocks where owner_id = p_owner_id and date = v_check_date) then
        return jsonb_build_object('success', false, 'error', 'This owner has blocked one or more dates in this range.');
      end if;
      v_check_date := v_check_date + 1;
    end loop;
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
    raise warning 'create_rental_booking failed: % (sqlstate %)', sqlerrm, sqlstate;
    return jsonb_build_object('success', false, 'error', 'Something went wrong saving your booking. Please try again, or contact admin if this keeps happening.');
end;
$$;
