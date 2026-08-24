-- Reverts track_jubah_booking's "reference AND ic_number both required"
-- constraint (added in 20260823140000_track_jubah_booking_require_ic.sql)
-- back to allowing either field alone, per explicit product decision —
-- customers found entering both fields to check status confusing.
--
-- Security note (raised and acknowledged before this change): a bare
-- reference or IC number is guessable/near-sequential/shareable-via-link,
-- so single-factor lookup does reopen the enumeration exposure the prior
-- migration closed. Kept deliberately narrow to limit the blast radius:
-- still exactly the two fields already in the UI (no hp_number/matric_id
-- OR-branches reintroduced — those were unused attack surface even before
-- 20260823140000), and still gated by check_jubah_rate_limit().
--
-- Matching rule: whichever of p_reference/p_ic_number is supplied must
-- match; if both are supplied, both must match (AND) rather than loosening
-- to OR, so a caller who does have both factors still gets the more
-- specific/safer lookup automatically.

drop function if exists public.track_jubah_booking(text, text);

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

  if coalesce(btrim(p_reference), '') = '' and coalesce(btrim(p_ic_number), '') = '' then
    raise exception 'Reference number or IC number is required';
  end if;

  return query
  select jb.id, jb.reference, jb.full_name, jb.hp_number, jb.campus, jb.faculty, jb.remark,
         jb.status, jb.payment_mode, jb.rider_id, jb.rider_name, p.phone as rider_phone,
         jb.balance_due, jb.balance_paid, jb.balance_proof_url
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where (coalesce(btrim(p_reference), '') = '' or jb.reference = p_reference)
    and (coalesce(btrim(p_ic_number), '') = '' or replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$$;

grant execute on function public.track_jubah_booking(text, text) to anon, authenticated;
