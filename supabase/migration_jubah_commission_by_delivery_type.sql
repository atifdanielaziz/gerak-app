-- ============================================================
-- Migration: split rider commission into pickup vs postage rates
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- A single flat rate applied to every order's full value doesn't hold up:
-- a postage order's price (RM90+, or +RM10 more for Sabah/Sarawak) includes
-- real shipping cost paid out to Pos Malaysia, not money the rider actually
-- earned handling it. A pickup order's price is closer to pure service
-- value. One universal rate either overpays the rider on postage orders'
-- shipping-cost portion, or underpays them on pickup orders if the rate is
-- set low to compensate. Two separate rates lets superadmin price each
-- correctly instead of guessing a single compromise number.
--
-- "Postage delivery" is determined the same way buildJubahReceiptRows and
-- every other part of this app already disambiguates it: payment_mode =
-- 'postage' directly, OR payment_mode = 'deposit' with a delivery_address
-- set (deposit's own postage sub-choice) — the deposit/full-payment split
-- doesn't change the actual delivery logistics, only which delivery method
-- was chosen within it.

delete from public.app_settings where key = 'jubah_rider_commission_percent';

insert into public.app_settings (key, value) values
  ('jubah_rider_commission_percent_pickup',  '20'),
  ('jubah_rider_commission_percent_postage', '20')
on conflict (key) do nothing;

-- Signature changed (added p_delivery_type) — CREATE OR REPLACE would leave
-- the old 1-arg version live as a separate overload otherwise, same trap
-- already hit and fixed twice this session for create_jubah_booking and
-- get_jubah_booking_live_status.
drop function if exists public.set_jubah_rider_commission_rate(numeric);

create or replace function public.set_jubah_rider_commission_rate(p_percent numeric, p_delivery_type text)
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
  if p_percent < 0 or p_percent > 100 then
    return jsonb_build_object('success', false, 'error', 'Commission must be between 0 and 100.');
  end if;

  insert into public.app_settings (key, value)
    values ('jubah_rider_commission_percent_' || p_delivery_type, p_percent::text)
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.set_jubah_rider_commission_rate(numeric, text) to authenticated;

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
  v_rate_key     text;
  v_rate         numeric;
  v_order_value  numeric;
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
    v_rate_key := case when v_is_postage then 'jubah_rider_commission_percent_postage'
                                          else 'jubah_rider_commission_percent_pickup' end;

    select coalesce(value::numeric, 0) into v_rate
    from public.app_settings where key = v_rate_key;
    v_order_value := v_booking.cost + coalesce(v_booking.balance_due, 0);

    update public.jubah_bookings
       set status = p_status,
           rider_commission_rate      = v_rate,
           rider_commission_amount    = round(v_order_value * v_rate / 100, 2),
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

-- Return columns changed (added is_postage) — Postgres won't let CREATE OR
-- REPLACE change a function's output row shape even with the same name and
-- input signature.
drop function if exists public.get_rider_jubah_earnings();

create or replace function public.get_rider_jubah_earnings()
returns table (
  reference               text,
  remark                  text,
  payment_mode            text,
  is_postage              boolean,
  order_value             numeric,
  rider_commission_rate   numeric,
  rider_commission_amount numeric,
  earned_at               timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    jb.reference, jb.remark, jb.payment_mode,
    (jb.payment_mode = 'postage' or (jb.payment_mode = 'deposit' and jb.delivery_address is not null)) as is_postage,
    jb.cost + coalesce(jb.balance_due, 0) as order_value,
    jb.rider_commission_rate, jb.rider_commission_amount, jb.rider_commission_earned_at
  from public.jubah_bookings jb
  where jb.rider_id = auth.uid()
    and jb.rider_commission_amount is not null
  order by jb.rider_commission_earned_at desc;
$$;
grant execute on function public.get_rider_jubah_earnings() to authenticated;
