-- ============================================================
-- Migration: Direct-payee riders (owners paid into their own account)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Product decision (2026-10-10): the owners (currently Adib and Atif) are
-- paid straight into their own account when a customer picks them as
-- rider; every other rider's customers pay the shared, superadmin-set
-- account + QR (app_settings jubah_bank_* / jubah-qr qr.jpg) exactly as
-- today. This is NOT the per-rider self-service model reverted on
-- 2026-08-01 (riders entering their own accounts, money outside platform
-- control): a payee account here can only be set by superadmin, and only
-- for riders superadmin explicitly marks as direct payees.
--
-- Each booking records its payee at booking time (payee_rider_id; null =
-- shared account) so the balance step keeps showing the account the
-- customer was given. A rider change re-points it to the new rider's
-- payee (or the shared account), matching who now handles the order.
--
-- Payment confirmation is tightened at the same time: whoever confirms
-- must be able to see the money land. Only superadmin, or the assigned
-- rider when the booking's payee is that same rider, can confirm the
-- initial payment or the deposit balance. (Previously also the assigned
-- rider for shared-account bookings, admins and Jubah leads, none of whom
-- can see the shared account.)

-- ── Payee accounts ──────────────────────────────────────────────────
create table if not exists public.jubah_payees (
  rider_id        uuid primary key references public.profiles(id) on delete cascade,
  bank_name       text not null,
  account_number  text not null,
  account_holder  text not null,
  is_active       boolean not null default true,
  updated_by      uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);
-- No policies: only the SECURITY DEFINER functions below touch it.
alter table public.jubah_payees enable row level security;
revoke all on table public.jubah_payees from anon, authenticated;

-- Public read of ONE active payee's details — the customer must see where
-- to transfer. Returns nothing for riders who aren't active direct payees
-- (caller then shows the shared account). QR image, if any, is at
-- jubah-qr/payees/<rider_id>.jpg (public bucket, superadmin-only write).
create or replace function public.get_jubah_payee(p_rider_id uuid)
returns table (rider_id uuid, bank_name text, account_number text, account_holder text)
language sql stable security definer
set search_path to 'public'
as $$
  select jp.rider_id, jp.bank_name, jp.account_number, jp.account_holder
  from public.jubah_payees jp
  where jp.rider_id = p_rider_id and jp.is_active;
$$;
revoke all on function public.get_jubah_payee(uuid) from public;
grant execute on function public.get_jubah_payee(uuid) to anon, authenticated;

-- Superadmin: every rider who can do Jubah, with their payee setup if any.
create or replace function public.superadmin_list_jubah_payees()
returns table (rider_id uuid, rider_name text, is_payee boolean, bank_name text, account_number text, account_holder text, is_active boolean)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if get_my_role() <> 'superadmin' then
    raise exception 'Superadmin only.';
  end if;
  return query
  select p.id, p.name, jp.rider_id is not null, jp.bank_name, jp.account_number, jp.account_holder, coalesce(jp.is_active, false)
  from public.profiles p
  left join public.jubah_payees jp on jp.rider_id = p.id
  where p.can_robe = true and p.role in ('rider', 'driver', 'admin', 'superadmin')
  order by (jp.rider_id is null), p.name;
end;
$$;

create or replace function public.superadmin_set_jubah_payee(
  p_rider_id uuid, p_bank_name text, p_account_number text, p_account_holder text, p_is_active boolean
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_bank text := btrim(coalesce(p_bank_name, ''));
  v_acc  text := regexp_replace(coalesce(p_account_number, ''), '\s', '', 'g');
  v_hold text := btrim(coalesce(p_account_holder, ''));
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  if not exists (select 1 from public.profiles where id = p_rider_id and can_robe = true) then
    return jsonb_build_object('success', false, 'error', 'That user is not a Jubah rider.');
  end if;
  -- Customers transfer real money to this — keep it plain and plausible.
  if length(v_bank) < 2 or length(v_bank) > 60 then
    return jsonb_build_object('success', false, 'error', 'Enter the bank name.');
  end if;
  if v_acc !~ '^[0-9-]{6,30}$' then
    return jsonb_build_object('success', false, 'error', 'Account number: digits only (6–30).');
  end if;
  if length(v_hold) < 3 or length(v_hold) > 100 then
    return jsonb_build_object('success', false, 'error', 'Enter the account holder name.');
  end if;

  insert into public.jubah_payees (rider_id, bank_name, account_number, account_holder, is_active, updated_by, updated_at)
  values (p_rider_id, v_bank, v_acc, v_hold, coalesce(p_is_active, true), auth.uid(), now())
  on conflict (rider_id) do update
    set bank_name = excluded.bank_name, account_number = excluded.account_number,
        account_holder = excluded.account_holder, is_active = excluded.is_active,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.superadmin_remove_jubah_payee(p_rider_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  delete from public.jubah_payees where rider_id = p_rider_id;
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.superadmin_list_jubah_payees() from public, anon;
grant execute on function public.superadmin_list_jubah_payees() to authenticated;
revoke all on function public.superadmin_set_jubah_payee(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.superadmin_set_jubah_payee(uuid, text, text, text, boolean) to authenticated;
revoke all on function public.superadmin_remove_jubah_payee(uuid) from public, anon;
grant execute on function public.superadmin_remove_jubah_payee(uuid) to authenticated;

-- ── Payee recorded on each booking ──────────────────────────────────
alter table public.jubah_bookings add column if not exists payee_rider_id uuid references public.profiles(id) on delete set null;

-- Set server-side (never trusted from the client) when a booking is
-- created and whenever its rider changes.
create or replace function public.jubah_booking_set_payee()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' or new.rider_id is distinct from old.rider_id then
    new.payee_rider_id := (
      select jp.rider_id from public.jubah_payees jp
      where jp.rider_id = new.rider_id and jp.is_active
    );
  end if;
  return new;
end;
$$;

drop trigger if exists jubah_booking_set_payee on public.jubah_bookings;
create trigger jubah_booking_set_payee
  before insert or update of rider_id on public.jubah_bookings
  for each row execute function public.jubah_booking_set_payee();

-- Who may confirm money arrived for this booking. Every branch is
-- coalesced to false: a shared-account booking has payee_rider_id NULL,
-- and "x = NULL" is NULL, not false — uncoalesced, the whole expression
-- became NULL and "if not <NULL>" let the rider through (caught in testing).
create or replace function public.jubah_can_confirm_payment(p_rider_id uuid, p_payee_rider_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce(public.get_my_role() = 'superadmin', false)
      or coalesce(auth.uid() is not null
                  and p_payee_rider_id is not null
                  and p_rider_id = auth.uid()
                  and p_payee_rider_id = auth.uid(), false);
$$;
revoke all on function public.jubah_can_confirm_payment(uuid, uuid) from public, anon, authenticated;

-- ── Tightened confirmations (live bodies, plus the payee gate) ─────
create or replace function public.update_jubah_booking_status(p_booking_id uuid, p_status text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_booking public.jubah_bookings;
  v_steps text[];
  v_cur_idx int;
  v_next text;
  v_delivery_type text;
  v_amount numeric;
begin
  select * into v_booking from public.jubah_bookings
  where id = p_booking_id
    and (
      rider_id = auth.uid()
      or public.get_my_role() in ('admin', 'superadmin')
      or public.jubah_lead_can_manage_university(university_key)
    );
  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if v_booking.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;
  if v_booking.status = 'ordered' then
    -- Confirming payment: only someone who can see the money arrive.
    if not public.jubah_can_confirm_payment(v_booking.rider_id, v_booking.payee_rider_id) then
      return jsonb_build_object('success', false, 'error', 'Only superadmin can confirm this payment.');
    end if;
    v_next := 'paid';
  else
    v_steps := case v_booking.payment_mode
      when 'deposit' then array['paid', 'processing', 'collected', 'delivered']
      when 'postage' then array['paid', 'processing', 'collected', 'delivered']
      else array['paid', 'processing', 'collected', 'delivered'] end;
    v_cur_idx := array_position(v_steps, v_booking.status);
    if v_cur_idx is null or v_cur_idx = array_length(v_steps, 1) then
      return jsonb_build_object('success', false, 'error', 'This booking cannot be advanced further.');
    end if;
    v_next := v_steps[v_cur_idx + 1];
  end if;
  if p_status <> v_next then
    return jsonb_build_object('success', false, 'error', 'Invalid status transition.');
  end if;
  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'paid' then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;
  if p_status = 'processing' and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    v_delivery_type := case when (v_booking.payment_mode = 'postage'
      or (v_booking.payment_mode = 'deposit' and v_booking.delivery_address is not null))
      then 'postage' else 'pickup' end;
    select coalesce(amount, 0) into v_amount
      from public.jubah_rider_commission
      where delivery_type = v_delivery_type and university = v_booking.university_key;
    update public.jubah_bookings set
      status = p_status,
      rider_commission_rate = null,
      rider_commission_amount = coalesce(v_amount, 0),
      rider_commission_earned_at = now()
      where id = p_booking_id;
  else
    update public.jubah_bookings set
      status = p_status,
      initial_paid = case when v_booking.status = 'ordered' then true else initial_paid end,
      initial_paid_at = case when v_booking.status = 'ordered' then now() else initial_paid_at end
      where id = p_booking_id;
  end if;
  return jsonb_build_object('success', true);
exception when others then
  raise warning 'update_jubah_booking_status failed: % (sqlstate %)', sqlerrm, sqlstate;
  return jsonb_build_object('success', false, 'error', 'Something went wrong updating this booking. Please try again, or contact admin if this keeps happening.');
end;
$function$;

create or replace function public.mark_jubah_balance_paid(p_booking_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_booking public.jubah_bookings;
begin
  select * into v_booking from public.jubah_bookings where id = p_booking_id;
  if v_booking.id is null
     or not public.jubah_can_confirm_payment(v_booking.rider_id, v_booking.payee_rider_id) then
    return jsonb_build_object('success', false, 'error', 'Only superadmin can confirm this payment.');
  end if;
  update public.jubah_bookings
     set balance_paid = true, balance_paid_at = now()
   where id = p_booking_id and status <> 'cancelled';
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or has been cancelled.');
  end if;
  return jsonb_build_object('success', true);
end;
$function$;

-- ── Track My Order also returns the booking's payee ────────────────
drop function if exists public.track_jubah_booking(text, text);
create function public.track_jubah_booking(p_reference text, p_ic_number text)
returns table(id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text, status text, payment_mode text, rider_id uuid, rider_name text, rider_phone text, balance_due numeric, balance_paid boolean, balance_proof_url text, rider_changed_at timestamptz, payee_rider_id uuid)
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
         jb.balance_due, jb.balance_paid, jb.balance_proof_url, jb.rider_changed_at, jb.payee_rider_id
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where (coalesce(btrim(p_reference), '') = '' or jb.reference = p_reference)
    and (coalesce(btrim(p_ic_number), '') = '' or replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$function$;
grant execute on function public.track_jubah_booking(text, text) to anon, authenticated;
