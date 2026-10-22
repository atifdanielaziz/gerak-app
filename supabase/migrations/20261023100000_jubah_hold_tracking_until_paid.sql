-- ============================================================
-- Migration: Hold the J&T tracking number until the balance is paid
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Owner's process for 23/10: J&T posts every parcel (the J&T page is
-- unchanged), but a deposit booking whose balance isn't paid yet must not
-- get its tracking number. Track My Order shows it as held ("will be
-- posted once the balance is paid") instead, the tracking email is
-- skipped and counted as held, and once the balance is confirmed the
-- email goes out automatically (the confirm handlers call
-- send-jubah-tracking-emails for that one booking).

create or replace function public.jubah_tracking_held(b public.jubah_bookings)
returns boolean
language sql immutable
as $$ select b.tracking_no is not null and b.payment_mode = 'deposit' and not coalesce(b.balance_paid, false); $$;

-- Track My Order: no tracking number while held, plus a flag for the message.
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
         public.jubah_tracking_held(jb)
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where (coalesce(btrim(p_reference), '') = '' or jb.reference = p_reference)
    and (coalesce(btrim(p_ic_number), '') = '' or replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$$;
grant execute on function public.track_jubah_booking(text, text) to anon, authenticated;

-- Counts: held ones are reported separately and are not "waiting".
create or replace function public.count_jubah_tracking_unsent(p_university text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_all boolean := coalesce(get_my_role(), '') = 'superadmin';
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Not signed in.');
  end if;
  return (
    select jsonb_build_object(
      'success', true,
      'pending', count(*) filter (where not public.jubah_tracking_held(b) and tracking_no is distinct from tracking_emailed_no and nullif(btrim(coalesce(email, '')), '') is not null),
      'held', count(*) filter (where public.jubah_tracking_held(b) and tracking_no is distinct from tracking_emailed_no),
      'no_email', count(*) filter (where not public.jubah_tracking_held(b) and tracking_no is distinct from tracking_emailed_no and nullif(btrim(coalesce(email, '')), '') is null),
      'emailed', count(*) filter (where tracking_emailed_no = tracking_no))
    from public.jubah_bookings b
    where university_key = p_university and status <> 'cancelled' and tracking_no is not null
      and (v_all or rider_id = auth.uid())
  );
end;
$$;
revoke all on function public.count_jubah_tracking_unsent(text) from public, anon;
grant execute on function public.count_jubah_tracking_unsent(text) to authenticated;
