-- ============================================================
-- Migration: Jubah rider commission — global rate + per-booking snapshot
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Columns to snapshot the commission actually earned on each booking —
--    computed once, at the moment a booking reaches its terminal status
--    (delivered/at_hub), using whatever the global rate is AT THAT MOMENT.
--    Deliberately NOT computed live from the current rate on every read —
--    that would silently rewrite historical earnings every time the rate
--    changes. Only ever set going forward from this migration; existing
--    already-delivered bookings are left untouched.
alter table public.jubah_bookings
  add column if not exists rider_commission_rate      numeric,
  add column if not exists rider_commission_amount     numeric,
  add column if not exists rider_commission_earned_at  timestamptz;

-- 2. Global commission rate — stored in the existing app_settings
--    key/value table (same one 'jubah_active' already uses), but writes
--    are funnelled through a dedicated superadmin-only RPC below rather
--    than relying on app_settings' own admin-inclusive RLS policy, since
--    this directly determines both rider pay and platform revenue.
insert into public.app_settings (key, value)
  values ('jubah_rider_commission_percent', '20')
  on conflict (key) do nothing;

create or replace function public.set_jubah_rider_commission_rate(p_percent numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() != 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if p_percent < 0 or p_percent > 100 then
    return jsonb_build_object('success', false, 'error', 'Commission must be between 0 and 100.');
  end if;

  insert into public.app_settings (key, value)
    values ('jubah_rider_commission_percent', p_percent::text)
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('success', true);
end;
$$;
grant execute on function public.set_jubah_rider_commission_rate(numeric) to authenticated;

-- 3. update_jubah_booking_status — same signature as the existing hardened
--    version (migration_jubah_status_transition_guard.sql), extended to
--    snapshot the commission when a transition actually completes a
--    booking (p_status is the last step in that payment mode's sequence).
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

  -- Reaching a terminal status already guarantees full payment (the
  -- balance gate above blocks a deposit booking from getting here with an
  -- unpaid balance) — only earn a commission for an actually-assigned
  -- rider, and only once (rider_commission_amount starts null).
  if v_is_terminal and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    select coalesce(value::numeric, 0) into v_rate
    from public.app_settings where key = 'jubah_rider_commission_percent';
    v_order_value := v_booking.cost + coalesce(v_booking.balance_due, 0);

    update public.jubah_bookings
       set status = p_status,
           rider_commission_rate     = v_rate,
           rider_commission_amount   = round(v_order_value * v_rate / 100, 2),
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

-- 4. Rider's own earnings — reference, order value, commission snapshot,
--    scoped to the calling rider only.
create or replace function public.get_rider_jubah_earnings()
returns table (
  reference               text,
  remark                  text,
  payment_mode            text,
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
    jb.cost + coalesce(jb.balance_due, 0) as order_value,
    jb.rider_commission_rate, jb.rider_commission_amount, jb.rider_commission_earned_at
  from public.jubah_bookings jb
  where jb.rider_id = auth.uid()
    and jb.rider_commission_amount is not null
  order by jb.rider_commission_earned_at desc;
$$;
grant execute on function public.get_rider_jubah_earnings() to authenticated;
