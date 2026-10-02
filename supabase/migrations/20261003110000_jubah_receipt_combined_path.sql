-- get_jubah_receipt returns the 4 replaceable doc paths (previous
-- migration) but not docs_path (Combined PDF) — Track My Order needs it so
-- customers can view/download the Combined PDF too (read-only there; it's
-- never a replace target, see jubah_document_replace.sql's rationale).
drop function if exists public.get_jubah_receipt(text, text);

create or replace function public.get_jubah_receipt(p_reference text, p_ic_last4 text)
returns table(
  id uuid, reference text, full_name text, ic_number text, hp_number text, email text,
  campus text, faculty text, university text, matric_id text, remark text, status text,
  payment_mode text, rider_name text, rider_phone text, cost numeric, balance_due numeric,
  balance_paid boolean, balance_paid_at timestamptz, initial_paid boolean, initial_paid_at timestamptz,
  delivery_address text, created_at timestamptz,
  oscar_path text, skpg_path text, konvo_path text, ic_path text, docs_path text
)
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
         jb.delivery_address, jb.created_at,
         jb.oscar_path, jb.skpg_path, jb.konvo_path, jb.ic_path, jb.docs_path
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and right(regexp_replace(jb.ic_number, '\D', '', 'g'), 4) = p_ic_last4;
end;
$$;
