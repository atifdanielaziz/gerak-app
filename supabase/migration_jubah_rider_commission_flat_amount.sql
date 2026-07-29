-- ============================================================
-- Migration: rider commission — percentage → flat RM amount
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Superadmin decided a flat RM amount per completed order is simpler and
-- more predictable for riders than a percentage of order value (which,
-- for postage orders, includes real shipping cost passed through to Pos
-- Malaysia — a rider handling a postage order didn't actually "earn" that
-- portion). Still split pickup vs postage, since the two delivery types
-- still deserve independently-set amounts.
--
-- rider_commission_rate (existing column) is left untouched in meaning
-- for historical rows — those bookings really were paid a percentage, and
-- that number stays correct as a record of how they were paid. Going
-- forward, newly-completed bookings get rider_commission_rate = NULL
-- (a percentage no longer applies) and rider_commission_amount is now a
-- direct copy of the flat setting rather than a computed order_value * rate.

delete from public.app_settings
  where key in ('jubah_rider_commission_percent_pickup', 'jubah_rider_commission_percent_postage');

insert into public.app_settings (key, value) values
  ('jubah_rider_commission_amount_pickup',  '25'),
  ('jubah_rider_commission_amount_postage', '25')
on conflict (key) do nothing;

-- Signature/name changed — CREATE OR REPLACE would leave the old
-- percentage-named function live as a separate, still-callable overload
-- otherwise, same trap already hit and fixed for other Jubah RPCs.
drop function if exists public.set_jubah_rider_commission_rate(numeric, text);

create or replace function public.set_jubah_rider_commission_amount(p_amount numeric, p_delivery_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() != 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if p_delivery_type not in ('pickup', 'postage') then
    return jsonb_build_object('success', false, 'error', 'Invalid delivery type.');
  end if;
  if p_amount < 0 then
    return jsonb_build_object('success', false, 'error', 'Commission amount cannot be negative.');
  end if;

  insert into public.app_settings (key, value)
    values ('jubah_rider_commission_amount_' || p_delivery_type, p_amount::text)
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.set_jubah_rider_commission_amount(numeric, text) to authenticated;

-- Same statement/behaviour tree as before — only the commission-on-
-- completion block (v_is_terminal branch) changes from a percentage
-- calculation to a direct flat-amount lookup.
create or replace function public.update_jubah_booking_status(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking      public.jubah_bookings;
  v_steps        text[];
  v_cur_idx      int;
  v_next         text;
  v_is_terminal  boolean := false;
  v_is_postage   boolean;
  v_amount_key   text;
  v_amount       numeric;
begin
  select * into v_booking
  from public.jubah_bookings
  where id = p_booking_id
    and (rider_id = auth.uid() or public.get_my_role() in ('admin', 'superadmin'));

  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;

  if v_booking.status = 'ordered' then
    v_next := case when v_booking.payment_mode = 'deposit' then 'booked' else 'paid' end;
  else
    v_steps := case v_booking.payment_mode
      when 'deposit' then array['booked', 'processing', 'collected', 'delivered']
      when 'postage' then array['paid', 'booked', 'processing', 'collected', 'at_hub']
      else                array['paid', 'booked', 'processing', 'collected', 'delivered']
    end;

    v_cur_idx := array_position(v_steps, v_booking.status);
    if v_cur_idx is null or v_cur_idx = array_length(v_steps, 1) then
      return jsonb_build_object('success', false, 'error', 'This booking cannot be advanced further.');
    end if;
    v_next := v_steps[v_cur_idx + 1];
    v_is_terminal := (v_cur_idx + 1 = array_length(v_steps, 1));
  end if;

  if p_status <> v_next then
    return jsonb_build_object('success', false, 'error', 'Invalid status transition.');
  end if;

  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'booked' then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;

  if v_is_terminal and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    v_is_postage := (v_booking.payment_mode = 'postage'
                      or (v_booking.payment_mode = 'deposit' and v_booking.delivery_address is not null));
    v_amount_key := case when v_is_postage then 'jubah_rider_commission_amount_postage'
                                            else 'jubah_rider_commission_amount_pickup' end;

    select coalesce(value::numeric, 0) into v_amount
    from public.app_settings where key = v_amount_key;

    update public.jubah_bookings
       set status = p_status,
           rider_commission_rate      = null,
           rider_commission_amount    = v_amount,
           rider_commission_earned_at = now()
     where id = p_booking_id;
  else
    update public.jubah_bookings
       set status = p_status,
           initial_paid    = case when v_booking.status = 'ordered' then true else initial_paid end,
           initial_paid_at = case when v_booking.status = 'ordered' then now() else initial_paid_at end
     where id = p_booking_id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;
