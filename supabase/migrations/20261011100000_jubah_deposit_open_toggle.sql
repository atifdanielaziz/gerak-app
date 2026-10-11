-- ============================================================
-- Migration: Superadmin can close the Jubah deposit option
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Near the robe-collection date the team needs full payment up front,
-- so superadmin can close "Deposit" for NEW bookings. Existing deposit
-- bookings are untouched: their balance step (Track My Order /
-- mark_jubah_balance_paid) keeps working. Reopen any time (next season).
--
-- app_settings.jubah_deposit_open ('true' / 'false'; missing = open) —
-- public read like the other Jubah settings so the booking form can hide
-- the option; written only via the superadmin RPC below (direct UPDATE is
-- blocked by the settings_update allowlist, 20260728191427). The insert
-- trigger is the real gate, so a client that ignores the hidden option
-- still can't create a deposit booking.

insert into public.app_settings (key, value) values ('jubah_deposit_open', 'true')
on conflict (key) do nothing;

create or replace function public.jubah_deposit_is_open()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select value from public.app_settings where key = 'jubah_deposit_open'), 'true') <> 'false';
$$;

create or replace function public.set_jubah_deposit_open(p_open boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  insert into public.app_settings (key, value) values ('jubah_deposit_open', case when p_open then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('success', true, 'open', p_open);
end;
$$;
revoke all on function public.set_jubah_deposit_open(boolean) from public, anon;
grant execute on function public.set_jubah_deposit_open(boolean) to authenticated;

create or replace function public.jubah_booking_block_closed_deposit()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.payment_mode = 'deposit' and not public.jubah_deposit_is_open() then
    raise exception 'Deposit is closed. Please choose Full Payment.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists jubah_booking_block_closed_deposit on public.jubah_bookings;
create trigger jubah_booking_block_closed_deposit
  before insert on public.jubah_bookings
  for each row execute function public.jubah_booking_block_closed_deposit();
