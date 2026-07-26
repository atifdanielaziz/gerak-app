-- ============================================================
-- Add balance_proof_url to get_jubah_booking_live_status
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Jubah.tsx's post-booking "Reservation Active" page (shown right after a
-- guest books, and revisited via the reference saved in localStorage) polls
-- this RPC for live status, but never knew whether a balance-payment proof
-- had already been submitted — so it couldn't show a "submitted, awaiting
-- review" state, or safely offer the upload UI without risking a duplicate
-- submission. Return type is changing (one extra column), so this needs a
-- DROP first — CREATE OR REPLACE can't change a function's return shape.

drop function if exists public.get_jubah_booking_live_status(text, text);

create function public.get_jubah_booking_live_status(p_reference text, p_hp_number text)
returns table(
  status text, rider_name text, rider_phone text,
  balance_paid boolean, balance_paid_at timestamptz,
  initial_paid boolean, initial_paid_at timestamptz,
  balance_proof_url text
)
language plpgsql
security definer
set search_path to 'public'
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
         jb.initial_paid, jb.initial_paid_at, jb.balance_proof_url
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and jb.hp_number = p_hp_number;
end;
$$;
