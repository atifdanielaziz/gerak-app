-- ============================================================
-- Migration: Superadmin can reassign a Jubah booking to another rider
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Rider was fixed at booking time with no way to move an order (e.g. a
-- rider who can't serve it after all). Superadmin-only, and only before the
-- robe is collected (ordered / paid / processing) — after that the
-- physical handover has happened and the rider is part of the record.
-- The new rider must be eligible for the booking exactly as at booking
-- time (same campus group, same pickup/postage method, active, can_robe),
-- except the order cap, which superadmin may override (the UI warns).
--
-- jubah_bookings direct UPDATE is revoked from clients
-- (20260728191431), so this SECURITY DEFINER RPC is the only write path;
-- rider_phone is filled by the existing jubah_booking_rider_phone trigger.
-- Commission is stored on the booking and attributed by rider_id, so an
-- order already in processing moves its commission to the new rider.

alter table public.jubah_bookings add column if not exists rider_changed_at timestamptz;

-- pickup / postage for rider matching — deposit bookings have no stored
-- method, so postage is inferred from a delivery address (same rule the
-- receipt email uses for "Booking Type").
create or replace function public.jubah_booking_rider_method(p_payment_mode text, p_delivery_address text)
returns text
language sql immutable
as $$
  select case
    when p_payment_mode = 'postage' then 'postage'
    when p_payment_mode = 'deposit' and nullif(btrim(coalesce(p_delivery_address, '')), '') is not null then 'postage'
    else 'pickup'
  end;
$$;

-- Riders a booking could be moved to, with their current order count and
-- whether they're at the cap. Superadmin only.
create or replace function public.superadmin_list_jubah_riders_for_booking(p_booking_id uuid)
returns table (id uuid, name text, phone text, order_count integer, at_cap boolean, is_current boolean)
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_booking public.jubah_bookings;
  v_uni text;
begin
  if get_my_role() <> 'superadmin' then
    raise exception 'Superadmin only.';
  end if;
  select * into v_booking from public.jubah_bookings where jubah_bookings.id = p_booking_id;
  if not found then
    raise exception 'Booking not found.';
  end if;
  v_uni := public.jubah_university_key_from_campus(v_booking.campus);

  return query
  select p.id, p.name, p.phone,
         public.jubah_rider_order_count(p.id, v_uni)::integer,
         public.jubah_rider_order_count(p.id, v_uni) >= public.jubah_rider_order_cap(),
         p.id = v_booking.rider_id
  from public.jubah_rider_assignments ja
  join public.profiles p on p.id = ja.rider_id
  where ja.campus    = any(public.jubah_campus_match_group(v_booking.campus))
    and ja.method    = public.jubah_booking_rider_method(v_booking.payment_mode, v_booking.delivery_address)
    and ja.is_active = true
    and p.role       in ('rider', 'driver', 'admin', 'superadmin')
    and p.can_robe   = true
    and p.status     = 'active'
  group by p.id, p.name, p.phone
  order by p.name;
end;
$$;

create or replace function public.superadmin_reassign_jubah_rider(p_booking_id uuid, p_new_rider_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_booking   public.jubah_bookings;
  v_new_name  text;
  v_actor     text;
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;

  select * into v_booking from public.jubah_bookings where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;
  if v_booking.status not in ('ordered', 'paid', 'processing') then
    return jsonb_build_object('success', false, 'error', 'The rider can only be changed before the robe is collected.');
  end if;
  if v_booking.rider_id = p_new_rider_id then
    return jsonb_build_object('success', false, 'error', 'This rider is already assigned.');
  end if;

  -- Same eligibility as the booking form, minus the order cap (override).
  select p.name into v_new_name
  from public.jubah_rider_assignments ja
  join public.profiles p on p.id = ja.rider_id
  where p.id = p_new_rider_id
    and ja.campus    = any(public.jubah_campus_match_group(v_booking.campus))
    and ja.method    = public.jubah_booking_rider_method(v_booking.payment_mode, v_booking.delivery_address)
    and ja.is_active = true
    and p.role       in ('rider', 'driver', 'admin', 'superadmin')
    and p.can_robe   = true
    and p.status     = 'active'
  limit 1;
  if v_new_name is null then
    return jsonb_build_object('success', false, 'error', 'That rider does not cover this campus and delivery method.');
  end if;

  update public.jubah_bookings
     set rider_id = p_new_rider_id,
         rider_name = v_new_name,
         rider_changed_at = now()
   where id = p_booking_id;

  select name into v_actor from public.profiles where id = auth.uid();
  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (
    auth.uid(), coalesce(v_actor, 'Unknown'), 'superadmin',
    'jubah_bookings', p_booking_id::text, 'reassign_rider',
    jsonb_build_object('from_rider', v_booking.rider_name, 'to_rider', v_new_name,
                       'from_rider_id', v_booking.rider_id, 'to_rider_id', p_new_rider_id)
  );

  return jsonb_build_object('success', true, 'rider_name', v_new_name);
end;
$$;

revoke all on function public.superadmin_list_jubah_riders_for_booking(uuid) from public, anon;
grant execute on function public.superadmin_list_jubah_riders_for_booking(uuid) to authenticated;
revoke all on function public.superadmin_reassign_jubah_rider(uuid, uuid) from public, anon;
grant execute on function public.superadmin_reassign_jubah_rider(uuid, uuid) to authenticated;

-- Track My Order: also return rider_changed_at so the customer is told to
-- update their ICMS Runner. Return type changes, so drop + recreate; body
-- is the live definition (20260824270000) plus that one column.
drop function if exists public.track_jubah_booking(text, text);
create function public.track_jubah_booking(p_reference text, p_ic_number text)
returns table(id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text, status text, payment_mode text, rider_id uuid, rider_name text, rider_phone text, balance_due numeric, balance_paid boolean, balance_proof_url text, rider_changed_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.check_jubah_rate_limit();

  if coalesce(btrim(p_reference), '') = '' and coalesce(btrim(p_ic_number), '') = '' then
    raise exception 'Reference number or IC number is required';
  end if;

  return query
  select jb.id, jb.reference, jb.full_name, jb.hp_number, jb.campus, jb.faculty, jb.remark,
         jb.status, jb.payment_mode, jb.rider_id, jb.rider_name, p.phone as rider_phone,
         jb.balance_due, jb.balance_paid, jb.balance_proof_url, jb.rider_changed_at
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where (coalesce(btrim(p_reference), '') = '' or jb.reference = p_reference)
    and (coalesce(btrim(p_ic_number), '') = '' or replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$function$;
grant execute on function public.track_jubah_booking(text, text) to anon, authenticated;
