-- Add Universiti Sultan Zainal Abidin (UniSZA) across Jubah and staff flows.
-- Campuses: Gong Badak, Medical, Besut.

alter table public.driver_invites drop constraint if exists driver_invites_campus_check;
alter table public.driver_invites add constraint driver_invites_campus_check
  check (campus in (
    'Pekan', 'Gambang',
    'Bangi',
    'Jeli', 'Bachok', 'Kota Bharu',
    'Shah Alam', 'Puncak Alam', 'Machang',
    'Gombak', 'Kuantan',
    'Sintok',
    'Gong Badak', 'Medical', 'Besut'
  ));

alter table public.jubah_bookings drop constraint if exists jubah_bookings_university_key_check;
alter table public.jubah_bookings add constraint jubah_bookings_university_key_check
  check (university_key = any (array[
    'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza'
  ]::text[]));

alter table public.jubah_bookings drop constraint if exists jubah_bookings_campus_check;
alter table public.jubah_bookings add constraint jubah_bookings_campus_check
  check (campus = any (array[
    'Pekan', 'Gambang',
    'UiTM', 'Shah Alam', 'Puncak Alam', 'Machang',
    'UMK', 'Jeli', 'Bachok', 'Kota Bharu',
    'UKM', 'Bangi',
    'UIAM', 'Gombak', 'Kuantan',
    'UUM', 'Sintok',
    'UniSZA', 'Gong Badak', 'Medical', 'Besut'
  ]::text[]));

-- Start UniSZA with the existing UMPSA pricing matrix. Admin can then
-- customise UniSZA independently from the Jubah Price tab.
insert into public.jubah_pricing (remark, payment_mode, price, university)
select remark, payment_mode, price, 'unisza'
from public.jubah_pricing
where university = 'umpsa'
on conflict (remark, payment_mode, university) do nothing;

-- Start UniSZA with the existing UMPSA rider commissions.
insert into public.jubah_rider_commission (delivery_type, university, amount)
select delivery_type, 'unisza', amount
from public.jubah_rider_commission
where university = 'umpsa'
on conflict (delivery_type, university) do nothing;

-- Like every non-UMPSA university, UniSZA initially follows the current
-- three-document Jubah requirement. It remains editable from Admin later.
delete from public.jubah_doc_fields where university_key = 'unisza';
insert into public.jubah_doc_fields
  (university_key, field_key, label, hint, position)
values
  ('unisza', 'konvo', 'Pengesahan Slip Kehadiran Konvokesyen', null, 1),
  ('unisza', 'skpg',  'SKPG',                                  null, 2),
  ('unisza', 'ic',    'IC (Front & Back)',                      'Accepts PDF or image (JPG/PNG)', 3);

-- The booking RPC validates university keys inside its PL/pgSQL body.
-- Preserve the latest authoritative function and widen only that allowlist,
-- avoiding a second hand-maintained copy of the full booking implementation.
do $migration$
declare
  v_definition text;
  v_widened text;
begin
  select pg_get_functiondef(p.oid)
    into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_jubah_booking'
    and p.pronargs = 24
  order by p.oid desc
  limit 1;

  if v_definition is null then
    raise exception 'create_jubah_booking(24 args) was not found';
  end if;

  v_widened := replace(
    v_definition,
    $allowlist$'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum'$allowlist$,
    $allowlist$'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza'$allowlist$
  );

  if v_widened = v_definition then
    raise exception 'create_jubah_booking university allowlist was not found';
  end if;

  execute v_widened;
end;
$migration$;
