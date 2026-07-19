-- ============================================================
-- Migration: Show a real message when Jubah tracking is rate-limited
-- Previously the throttle silently returned an empty result set,
-- deliberately indistinguishable from "genuinely not found" — but this
-- confused real users who hit the limit during normal use, showing
-- "No booking found" for a booking that definitely exists. Switches to
-- raising an explicit error instead, surfaced by TrackJubah.tsx.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create or replace function public.track_jubah_booking(
  p_reference text default null,
  p_hp_number text default null,
  p_matric_id text default null,
  p_ic_number text default null
) returns table (
  id uuid, reference text, full_name text, hp_number text, campus text, faculty text,
  remark text, status text, payment_mode text, rider_name text, rider_phone text,
  balance_due numeric, balance_paid boolean, balance_proof_url text
)
language plpgsql security definer set search_path = public as $$
declare
  v_recent_count integer;
begin
  delete from public.jubah_tracking_attempts where attempted_at < now() - interval '1 minute';
  select count(*) into v_recent_count from public.jubah_tracking_attempts;
  if v_recent_count >= 20 then
    raise exception 'Too many tracking requests right now. Please wait a minute and try again.';
  end if;
  insert into public.jubah_tracking_attempts default values;

  return query
  select jb.id, jb.reference, jb.full_name, jb.hp_number, jb.campus, jb.faculty, jb.remark,
         jb.status, jb.payment_mode, jb.rider_name, p.phone as rider_phone,
         jb.balance_due, jb.balance_paid, jb.balance_proof_url
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where
    (p_reference  is not null and jb.reference = p_reference) or
    (p_hp_number  is not null and jb.hp_number = p_hp_number) or
    (p_matric_id  is not null and lower(jb.matric_id) = lower(p_matric_id)) or
    (p_ic_number  is not null and replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$$;
