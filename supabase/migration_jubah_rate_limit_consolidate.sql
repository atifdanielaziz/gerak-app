-- ============================================================
-- Consolidate Jubah tracking rate-limit checks + raise the shared budget
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- check_jubah_rate_limit()'s "80 requests/minute, shared across every
-- guest-facing Jubah RPC" was duplicated inline in 3 separate functions
-- (track_jubah_booking, get_jubah_receipt, get_jubah_booking_live_status)
-- instead of all four calling the one shared helper that already existed
-- (submit_jubah_balance and cancel_jubah_booking_customer already did).
-- That's the same drift risk as any other duplicated logic — tune it in
-- one place and the other three silently keep the old number. Reduced to
-- one implementation, called by all five.
--
-- Also raising the budget itself: Jubah.tsx's post-booking page now polls
-- get_jubah_booking_live_status every 30s per open tab, on top of the
-- existing search/receipt/balance/cancel traffic sharing the same pool —
-- at real intake volume (dozens of guests with the page open at once)
-- that background polling alone could exhaust 80/min. Return type is
-- unchanged for all of these — only bodies change, so no DROP needed.

create or replace function public.check_jubah_rate_limit()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recent_count integer;
begin
  delete from public.jubah_tracking_attempts where attempted_at < now() - interval '1 minute';
  select count(*) into v_recent_count from public.jubah_tracking_attempts;
  if v_recent_count >= 300 then
    raise exception 'Too many requests right now. Please wait a minute and try again.';
  end if;
  insert into public.jubah_tracking_attempts default values;
end;
$$;

create or replace function public.track_jubah_booking(p_reference text default null, p_hp_number text default null, p_matric_id text default null, p_ic_number text default null)
returns table(id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text, status text, payment_mode text, rider_name text, rider_phone text, balance_due numeric, balance_paid boolean, balance_proof_url text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

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

create or replace function public.get_jubah_receipt(p_reference text, p_ic_last4 text)
returns table(id uuid, reference text, full_name text, ic_number text, hp_number text, email text, campus text, faculty text, university text, matric_id text, remark text, status text, payment_mode text, rider_name text, rider_phone text, cost numeric, balance_due numeric, balance_paid boolean, balance_paid_at timestamptz, initial_paid boolean, initial_paid_at timestamptz, delivery_address text, created_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

  return query
  select jb.id, jb.reference, jb.full_name,
         case
           when jb.ic_number is null then null
           when length(regexp_replace(jb.ic_number, '\D', '', 'g')) < 6 then null
           else substring(regexp_replace(jb.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
         end as ic_number,
         jb.hp_number, jb.email, jb.campus, jb.faculty, jb.university, jb.matric_id, jb.remark,
         jb.status, jb.payment_mode, jb.rider_name, p.phone as rider_phone,
         jb.cost, jb.balance_due, jb.balance_paid, jb.balance_paid_at,
         jb.initial_paid, jb.initial_paid_at,
         jb.delivery_address, jb.created_at
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and right(regexp_replace(jb.ic_number, '\D', '', 'g'), 4) = p_ic_last4;
end;
$$;

create or replace function public.get_jubah_booking_live_status(p_reference text, p_hp_number text)
returns table(status text, rider_name text, rider_phone text, balance_paid boolean, balance_paid_at timestamptz, initial_paid boolean, initial_paid_at timestamptz, balance_proof_url text)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

  return query
  select jb.status, jb.rider_name, p.phone as rider_phone, jb.balance_paid, jb.balance_paid_at,
         jb.initial_paid, jb.initial_paid_at, jb.balance_proof_url
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and jb.hp_number = p_hp_number;
end;
$$;
