-- ============================================================
-- Migration: Gate the full Jubah receipt behind the last 4 IC digits
-- migration_jubah_track_receipt_fields.sql widened track_jubah_booking to
-- return phone, delivery address, and other fields needed for a full
-- receipt — but track_jubah_booking is reachable via a guessable matric ID
-- (per migration_jubah_track_hardening.sql's own warning), so that would
-- have exposed a real student's phone/address to anyone who guessed their
-- matric ID, throttle notwithstanding.
--
-- This reverts track_jubah_booking to its previous narrow shape (safe
-- regardless of whether the wider migration was already run) and adds a
-- separate get_jubah_receipt RPC: same throttle, but only returns the full
-- receipt (unmasked-ish phone, delivery address, cost breakdown) when the
-- caller also proves they know the last 4 digits of the IC on file — a
-- matric-ID guess alone no longer unlocks it.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

DROP FUNCTION IF EXISTS public.track_jubah_booking(text, text, text, text);

CREATE OR REPLACE FUNCTION public.track_jubah_booking(
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

GRANT EXECUTE ON FUNCTION public.track_jubah_booking(text, text, text, text) TO anon, authenticated;

-- ── Full receipt, gated by last-4 IC digits ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_jubah_receipt(
  p_reference text,
  p_ic_last4  text
) returns table (
  id uuid, reference text, full_name text, ic_number text, hp_number text,
  campus text, faculty text, university text, matric_id text,
  remark text, status text, payment_mode text, rider_name text, rider_phone text,
  cost numeric, balance_due numeric, balance_paid boolean, balance_paid_at timestamptz,
  delivery_address text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_recent_count integer;
begin
  -- Shares the same global budget as track_jubah_booking — this is also a
  -- guessing surface (4 digits against a known reference) and needs the
  -- same protection.
  delete from public.jubah_tracking_attempts where attempted_at < now() - interval '1 minute';
  select count(*) into v_recent_count from public.jubah_tracking_attempts;
  if v_recent_count >= 20 then
    raise exception 'Too many requests right now. Please wait a minute and try again.';
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
         jb.delivery_address, jb.created_at
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and right(regexp_replace(jb.ic_number, '\D', '', 'g'), 4) = p_ic_last4;
end;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_receipt(text, text) TO anon, authenticated;
