-- Add UTP, UPM, UM and UPSI across staff, Jubah and faculty flows.

alter table public.driver_invites drop constraint if exists driver_invites_campus_check;
alter table public.driver_invites add constraint driver_invites_campus_check
  check (campus in (
    'Pekan', 'Gambang',
    'Bangi',
    'Jeli', 'Bachok', 'Kota Bharu',
    'Shah Alam', 'Puncak Alam', 'Machang',
    'Gombak', 'Kuantan',
    'Sintok',
    'Gong Badak', 'Medical', 'Besut',
    'Seri Iskandar',
    'Serdang', 'Sarawak',
    'Kuala Lumpur',
    'KSAJS', 'KSAS'
  ));

alter table public.jubah_bookings drop constraint if exists jubah_bookings_university_key_check;
alter table public.jubah_bookings add constraint jubah_bookings_university_key_check
  check (university_key = any (array[
    'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza',
    'utp', 'upm', 'um', 'upsi'
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
    'UniSZA', 'Gong Badak', 'Medical', 'Besut',
    'UTP', 'Seri Iskandar',
    'UPM', 'Serdang', 'Sarawak',
    'UM', 'Kuala Lumpur',
    'UPSI', 'KSAJS', 'KSAS'
  ]::text[]));

alter table public.jubah_faculties drop constraint if exists jubah_faculties_university_key_check;
alter table public.jubah_faculties add constraint jubah_faculties_university_key_check
  check (university_key in (
    'umpsa','uitm','umk','ukm','uiam','uum','unisza','utp','upm','um','upsi'
  ));

-- Each new university starts from the current UMPSA commercial defaults and
-- can then be customised independently in Admin > Jubah.
insert into public.jubah_pricing (remark, payment_mode, price, university)
select p.remark, p.payment_mode, p.price, u.university
from public.jubah_pricing p
cross join (values ('utp'), ('upm'), ('um'), ('upsi')) as u(university)
where p.university = 'umpsa'
on conflict (remark, payment_mode, university) do nothing;

insert into public.jubah_rider_commission (delivery_type, university, amount)
select c.delivery_type, u.university, c.amount
from public.jubah_rider_commission c
cross join (values ('utp'), ('upm'), ('um'), ('upsi')) as u(university)
where c.university = 'umpsa'
on conflict (delivery_type, university) do nothing;

-- New universities initially use the standard three-document Jubah form.
delete from public.jubah_doc_fields
where university_key in ('utp', 'upm', 'um', 'upsi');

insert into public.jubah_doc_fields
  (university_key, field_key, label, hint, position)
select u.university_key, f.field_key, f.label, f.hint, f.position
from (values ('utp'), ('upm'), ('um'), ('upsi')) as u(university_key)
cross join (values
  ('konvo', 'Pengesahan Slip Kehadiran Konvokesyen', null::text, 1),
  ('skpg',  'SKPG',                                  null::text, 2),
  ('ic',    'IC (Front & Back)', 'Accepts PDF or image (JPG/PNG)'::text, 3)
) as f(field_key, label, hint, position);

-- Widen the authoritative booking RPC's internal university allowlist.
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
    $allowlist$'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza'$allowlist$,
    $allowlist$'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza', 'utp', 'upm', 'um', 'upsi'$allowlist$
  );

  if v_widened = v_definition then
    raise exception 'create_jubah_booking university allowlist was not found';
  end if;

  execute v_widened;
end;
$migration$;

-- Recreate faculty policies so university-scoped admins can manage the new
-- directories as well as superadmins.
drop policy if exists "read_active_jubah_faculties" on public.jubah_faculties;
create policy "read_active_jubah_faculties"
  on public.jubah_faculties for select
  using (
    is_active
    or public.get_my_role() = 'superadmin'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and university_key = case
          when p.campus in ('Pekan','Gambang') then 'umpsa'
          when p.campus in ('Shah Alam','Puncak Alam','Machang') then 'uitm'
          when p.campus in ('Jeli','Bachok','Kota Bharu') then 'umk'
          when p.campus = 'Bangi' then 'ukm'
          when p.campus in ('Gombak','Kuantan') then 'uiam'
          when p.campus = 'Sintok' then 'uum'
          when p.campus in ('Gong Badak','Medical','Besut') then 'unisza'
          when p.campus = 'Seri Iskandar' then 'utp'
          when p.campus in ('Serdang','Sarawak') then 'upm'
          when p.campus = 'Kuala Lumpur' then 'um'
          when p.campus in ('KSAJS','KSAS') then 'upsi'
        end
    )
  );

drop policy if exists "manage_scoped_jubah_faculties" on public.jubah_faculties;
create policy "manage_scoped_jubah_faculties"
  on public.jubah_faculties for all to authenticated
  using (
    public.get_my_role() = 'superadmin'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and university_key = case
          when p.campus in ('Pekan','Gambang') then 'umpsa'
          when p.campus in ('Shah Alam','Puncak Alam','Machang') then 'uitm'
          when p.campus in ('Jeli','Bachok','Kota Bharu') then 'umk'
          when p.campus = 'Bangi' then 'ukm'
          when p.campus in ('Gombak','Kuantan') then 'uiam'
          when p.campus = 'Sintok' then 'uum'
          when p.campus in ('Gong Badak','Medical','Besut') then 'unisza'
          when p.campus = 'Seri Iskandar' then 'utp'
          when p.campus in ('Serdang','Sarawak') then 'upm'
          when p.campus = 'Kuala Lumpur' then 'um'
          when p.campus in ('KSAJS','KSAS') then 'upsi'
        end
    )
  )
  with check (
    public.get_my_role() = 'superadmin'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
        and university_key = case
          when p.campus in ('Pekan','Gambang') then 'umpsa'
          when p.campus in ('Shah Alam','Puncak Alam','Machang') then 'uitm'
          when p.campus in ('Jeli','Bachok','Kota Bharu') then 'umk'
          when p.campus = 'Bangi' then 'ukm'
          when p.campus in ('Gombak','Kuantan') then 'uiam'
          when p.campus = 'Sintok' then 'uum'
          when p.campus in ('Gong Badak','Medical','Besut') then 'unisza'
          when p.campus = 'Seri Iskandar' then 'utp'
          when p.campus in ('Serdang','Sarawak') then 'upm'
          when p.campus = 'Kuala Lumpur' then 'um'
          when p.campus in ('KSAJS','KSAS') then 'upsi'
        end
    )
  );
