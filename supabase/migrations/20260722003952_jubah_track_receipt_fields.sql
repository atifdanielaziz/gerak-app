-- ============================================================
-- Migration: Widen track_jubah_booking so Track My Order can show a full
-- receipt (Save as PDF included), not just a status card.
--
-- Adds: matric_id, university, cost, balance_paid_at, delivery_address,
-- created_at, and a MASKED ic_number.
--
-- ic_number is deliberately masked (first 6 digits + 'XX-XXXX'), same
-- pattern as get_jubah_riders_directory_v2 — this RPC is anon-callable and
-- matric_id is one of its own lookup keys, small and guessable (per
-- migration_jubah_track_hardening.sql's own reasoning). Returning a raw IC
-- would let a matric-ID guessing attack harvest real IC numbers even
-- without ever knowing them. The customer doesn't need the last 6 digits
-- back to recognize their own receipt.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

DROP FUNCTION IF EXISTS public.track_jubah_booking(text, text, text, text);

CREATE OR REPLACE FUNCTION public.track_jubah_booking(
  p_reference text default null,
  p_hp_number text default null,
  p_matric_id text default null,
  p_ic_number text default null
) returns table (
  id uuid, reference text, full_name text, ic_number text, hp_number text,
  campus text, faculty text, university text, matric_id text,
  remark text, status text, payment_mode text, rider_name text, rider_phone text,
  cost numeric, balance_due numeric, balance_paid boolean, balance_paid_at timestamptz,
  balance_proof_url text, delivery_address text, created_at timestamptz
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
  select jb.id, jb.reference, jb.full_name,
         case
           when jb.ic_number is null then null
           when length(regexp_replace(jb.ic_number, '\D', '', 'g')) < 6 then null
           else substring(regexp_replace(jb.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
         end as ic_number,
         jb.hp_number, jb.campus, jb.faculty, jb.university, jb.matric_id, jb.remark,
         jb.status, jb.payment_mode, jb.rider_name, p.phone as rider_phone,
         jb.cost, jb.balance_due, jb.balance_paid, jb.balance_paid_at,
         jb.balance_proof_url, jb.delivery_address, jb.created_at
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

GRANT EXECUTE ON FUNCTION public.track_jubah_booking(text, text, text, text) TO anon, authenticated;
