-- track_jubah_booking previously OR'd four independent lookup keys together
-- (reference, hp_number, matric_id, ic_number) and was granted to anon —
-- knowing any ONE of the four returned full_name, unmasked hp_number,
-- campus, faculty, status, and rider contact for that booking. Matric IDs
-- are near-sequential per intake, so this let anyone enumerate a whole
-- cohort's booking details with no prior knowledge of any specific victim,
-- directly via the public REST RPC endpoint (the frontend UI restricting
-- which fields it showed was never a security boundary — anon-granted RPCs
-- are callable directly with the public anon key, bypassing the app
-- entirely).
--
-- Matches the two-factor pattern already used correctly by
-- get_jubah_receipt/get_jubah_booking_live_status: reference AND a second
-- identifier are both required, dropping the two OR-branches (hp_number,
-- matric_id) the frontend never even sent — they were pure unused attack
-- surface.

drop function if exists public.track_jubah_booking(text, text, text, text);

create or replace function public.track_jubah_booking(p_reference text, p_ic_number text)
returns table(
  id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text,
  status text, payment_mode text, rider_id uuid, rider_name text, rider_phone text,
  balance_due numeric, balance_paid boolean, balance_proof_url text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

  return query
  select jb.id, jb.reference, jb.full_name, jb.hp_number, jb.campus, jb.faculty, jb.remark,
         jb.status, jb.payment_mode, jb.rider_id, jb.rider_name, p.phone as rider_phone,
         jb.balance_due, jb.balance_paid, jb.balance_proof_url
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', '')
  order by jb.created_at desc;
end;
$$;

grant execute on function public.track_jubah_booking(text, text) to anon, authenticated;
