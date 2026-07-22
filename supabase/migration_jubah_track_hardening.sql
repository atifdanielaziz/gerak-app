-- ============================================================
-- Migration: Harden the public Jubah tracking lookup
-- track_jubah_booking did `SELECT * FROM jubah_bookings`, granted to
-- anon, with no rate limit — returning the customer's full IC number,
-- delivery address, and every uploaded document's storage path to
-- anyone who matched a booking via reference, phone, matric ID, or IC.
-- Matric ID especially is a small, guessable, structured space (e.g.
-- HB19021), making this bulk-scrapeable with zero rate limiting.
--
-- This narrows the response to exactly what TrackJubah.tsx actually
-- displays, adds a global throttle (20 lookups/minute across all
-- callers — a per-IP throttle isn't reliably possible here since anon
-- RPC calls go through Supabase's pooler, which hides the real caller
-- IP from a plain SQL function), and properly joins the rider's phone
-- from profiles instead of trusting a possibly-stale/undocumented
-- column on jubah_bookings.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create table if not exists public.jubah_tracking_attempts (
  id uuid default gen_random_uuid() primary key,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_jubah_tracking_attempts_time on public.jubah_tracking_attempts (attempted_at);

-- CREATE OR REPLACE can't change a function's return columns, only its
-- body — must DROP first since this changes SETOF jubah_bookings to an
-- explicit narrower TABLE(...) shape.
drop function if exists public.track_jubah_booking(text, text, text, text);

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
  -- Global throttle: don't reveal that a rate limit exists — a throttled
  -- call just returns no rows, identical to "not found".
  delete from public.jubah_tracking_attempts where attempted_at < now() - interval '1 minute';
  select count(*) into v_recent_count from public.jubah_tracking_attempts;
  if v_recent_count >= 20 then
    return;
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

grant execute on function public.track_jubah_booking(text, text, text, text) to anon, authenticated;
