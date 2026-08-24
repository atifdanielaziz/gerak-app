-- ============================================================
-- Stop leaking raw Postgres errors from create_rental_booking
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- `when others then return jsonb_build_object('success', false, 'error',
-- sqlerrm)` sends the raw Postgres error message straight to the client —
-- the exact anti-pattern already fixed on create_jubah_booking three times
-- over (20260728191428, ...429, ...433), never ported here. Same fix:
-- raise warning server-side for real diagnosis, generic message to the
-- client. The 23P01 slot-race branch already returned a clean message and
-- is unchanged.

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
    raise warning 'create_rental_booking failed: % (sqlstate %)', sqlerrm, sqlstate;
    return jsonb_build_object('success', false, 'error', 'Something went wrong saving your booking. Please try again, or contact admin if this keeps happening.');
end;
$$;
