-- ============================================================
-- Migration: harden get_jubah_booking_live_status
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Unlike every other public Jubah lookup (cancel_jubah_booking_customer
-- pairs reference+phone; track_jubah_booking and get_jubah_receipt share
-- the jubah_tracking_attempts rate limit), this one took only a reference
-- number, with no ownership check and no throttling at all. Reference
-- numbers are only 4 random base36 characters (~1.68M combinations) — with
-- zero rate limiting this is realistically brute-forceable, and it returns
-- the assigned rider's phone number plus live payment status for whatever
-- booking is guessed. Now requires the matching phone number (same
-- ownership-pairing convention as cancel_jubah_booking_customer) and shares
-- the same rate limit as the other lookups.
-- CREATE OR REPLACE with a different parameter list creates a new overload
-- rather than replacing the old one (this is exactly what happened to
-- create_jubah_booking, fixed in migration_jubah_drop_stale_create_booking_
-- overloads.sql) — drop the old 1-arg signature explicitly so the
-- unauthenticated version can't still be called directly.
drop function if exists public.get_jubah_booking_live_status(text);

create or replace function public.get_jubah_booking_live_status(p_reference text, p_hp_number text)
returns table(status text, rider_name text, rider_phone text, balance_paid boolean, balance_paid_at timestamptz, initial_paid boolean, initial_paid_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_count integer;
begin
  delete from public.jubah_tracking_attempts where attempted_at < now() - interval '1 minute';
  select count(*) into v_recent_count from public.jubah_tracking_attempts;
  if v_recent_count >= 80 then
    raise exception 'Too many requests right now. Please wait a minute and try again.';
  end if;
  insert into public.jubah_tracking_attempts default values;

  return query
  select jb.status, jb.rider_name, p.phone as rider_phone, jb.balance_paid, jb.balance_paid_at,
         jb.initial_paid, jb.initial_paid_at
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and jb.hp_number = p_hp_number;
end;
$$;
