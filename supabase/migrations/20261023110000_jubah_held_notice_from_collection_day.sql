-- ============================================================
-- Migration: Show the "held" notice from collection day, not only once tracked
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Track My Order's "Jubah anda ditahan 📦 — Parcel anda akan dipos selepas
-- baki RMxx dibayar" used to appear only after J&T had entered a tracking
-- number. Owner wants it from collection day (23/10/2026) for every
-- postage deposit booking whose balance is still unpaid. The tracking
-- number itself stays hidden exactly as before (jubah_tracking_held).

drop function if exists public.track_jubah_booking(text, text);
create function public.track_jubah_booking(p_reference text, p_ic_number text)
returns table(id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text, status text, payment_mode text, rider_id uuid, rider_name text, rider_phone text, balance_due numeric, balance_paid boolean, balance_proof_url text, rider_changed_at timestamp with time zone, payee_rider_id uuid, tracking_no text, tracking_held boolean)
language plpgsql security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

  if coalesce(btrim(p_reference), '') = '' and coalesce(btrim(p_ic_number), '') = '' then
    raise exception 'Reference number or IC number is required';
  end if;

  return query
  select jb.id, jb.reference, jb.full_name, jb.hp_number, jb.campus, jb.faculty, jb.remark,
         jb.status, jb.payment_mode, jb.rider_id, jb.rider_name, p.phone as rider_phone,
         jb.balance_due, jb.balance_paid, jb.balance_proof_url, jb.rider_changed_at, jb.payee_rider_id,
         case when public.jubah_tracking_held(jb) then null else jb.tracking_no end,
         -- Notice: postage deposit, balance unpaid, from collection day.
         (jb.payment_mode = 'deposit' and jb.delivery_address is not null and not coalesce(jb.balance_paid, false)
           and now() >= timestamptz '2026-10-23 00:00:00+08')
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where (coalesce(btrim(p_reference), '') = '' or jb.reference = p_reference)
    and (coalesce(btrim(p_ic_number), '') = '' or replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$$;
grant execute on function public.track_jubah_booking(text, text) to anon, authenticated;
