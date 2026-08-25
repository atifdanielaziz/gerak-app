-- Add UMS and UNIMAS across staff, Jubah, faculty and custom-quote flows.

alter table public.driver_invites drop constraint if exists driver_invites_campus_check;
alter table public.driver_invites add constraint driver_invites_campus_check
  check (campus in (
    'Pekan', 'Gambang', 'Bangi', 'Jeli', 'Bachok', 'Kota Bharu',
    'Shah Alam', 'Puncak Alam', 'Machang', 'Gombak', 'Kuantan', 'Sintok',
    'Gong Badak', 'Medical', 'Besut', 'Seri Iskandar', 'Serdang', 'Sarawak',
    'Kuala Lumpur', 'KSAJS', 'KSAS',
    'Kota Kinabalu', 'Labuan International', 'Sandakan',
    'Barat', 'Timur', 'Bandar'
  ));

alter table public.jubah_bookings drop constraint if exists jubah_bookings_university_key_check;
alter table public.jubah_bookings add constraint jubah_bookings_university_key_check
  check (university_key = any (array[
    'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza',
    'utp', 'upm', 'um', 'upsi', 'ums', 'unimas'
  ]::text[]));

alter table public.jubah_bookings drop constraint if exists jubah_bookings_campus_check;
alter table public.jubah_bookings add constraint jubah_bookings_campus_check
  check (campus = any (array[
    'Pekan', 'Gambang', 'UiTM', 'Shah Alam', 'Puncak Alam', 'Machang',
    'UMK', 'Jeli', 'Bachok', 'Kota Bharu', 'UKM', 'Bangi',
    'UIAM', 'Gombak', 'Kuantan', 'UUM', 'Sintok',
    'UniSZA', 'Gong Badak', 'Medical', 'Besut', 'UTP', 'Seri Iskandar',
    'UPM', 'Serdang', 'Sarawak', 'UM', 'Kuala Lumpur', 'UPSI', 'KSAJS', 'KSAS',
    'UMS', 'Kota Kinabalu', 'Labuan International', 'Sandakan',
    'UNIMAS', 'Barat', 'Timur', 'Bandar'
  ]::text[]));

alter table public.jubah_faculties drop constraint if exists jubah_faculties_university_key_check;
alter table public.jubah_faculties add constraint jubah_faculties_university_key_check
  check (university_key in (
    'umpsa','uitm','umk','ukm','uiam','uum','unisza','utp','upm','um','upsi','ums','unimas'
  ));

-- Start each university from UMPSA's current commercial defaults. Admins can
-- customise these independently afterward.
insert into public.jubah_pricing (remark, payment_mode, price, university)
select p.remark, p.payment_mode, p.price, u.university
from public.jubah_pricing p
cross join (values ('ums'), ('unimas')) as u(university)
where p.university = 'umpsa'
on conflict (remark, payment_mode, university) do nothing;

insert into public.jubah_rider_commission (delivery_type, university, amount)
select c.delivery_type, u.university, c.amount
from public.jubah_rider_commission c
cross join (values ('ums'), ('unimas')) as u(university)
where c.university = 'umpsa'
on conflict (delivery_type, university) do nothing;

delete from public.jubah_doc_fields where university_key in ('ums', 'unimas');
insert into public.jubah_doc_fields (university_key, field_key, label, hint, position)
select u.university_key, f.field_key, f.label, f.hint, f.position
from (values ('ums'), ('unimas')) as u(university_key)
cross join (values
  ('konvo', 'Pengesahan Slip Kehadiran Konvokesyen', null::text, 1),
  ('skpg',  'SKPG', null::text, 2),
  ('ic', 'IC (Front & Back)', 'Accepts PDF or image (JPG/PNG)'::text, 3)
) as f(field_key, label, hint, position);

-- Widen the authoritative booking RPC allowlist without replacing its other
-- hardened validation and pricing logic.
do $migration$
declare v_definition text; v_widened text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_jubah_booking' and p.pronargs = 24
  order by p.oid desc limit 1;
  if v_definition is null then raise exception 'create_jubah_booking(24 args) was not found'; end if;
  v_widened := replace(
    v_definition,
    $old$'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza', 'utp', 'upm', 'um', 'upsi'$old$,
    $new$'umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza', 'utp', 'upm', 'um', 'upsi', 'ums', 'unimas'$new$
  );
  if v_widened = v_definition then raise exception 'create_jubah_booking university allowlist was not found'; end if;
  execute v_widened;
end;
$migration$;

-- Widen the quote RPC's university and campus validation while retaining the
-- compact-token, single-use and abuse-protection logic from the live function.
do $migration$
declare v_definition text; v_widened text; v_with_universities text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_jubah_custom_quote' and p.pronargs = 8
  order by p.oid desc limit 1;
  if v_definition is null then raise exception 'create_jubah_custom_quote(8 args) was not found'; end if;
  v_with_universities := replace(
    v_definition,
    $old$'umpsa','uitm','umk','ukm','uiam','uum','unisza','utp','upm','um','upsi'$old$,
    $new$'umpsa','uitm','umk','ukm','uiam','uum','unisza','utp','upm','um','upsi','ums','unimas'$new$
  );
  if v_with_universities = v_definition then raise exception 'create_jubah_custom_quote university allowlist was not found'; end if;
  v_widened := replace(
    v_with_universities,
    $old$(p_university_key = 'upsi' and p_campus in ('KSAJS','KSAS'))$old$,
    $new$(p_university_key = 'upsi' and p_campus in ('KSAJS','KSAS')) or
    (p_university_key = 'ums' and p_campus in ('Kota Kinabalu','Labuan International','Sandakan')) or
    (p_university_key = 'unimas' and p_campus in ('Barat','Timur','Bandar'))$new$
  );
  if v_widened = v_with_universities then raise exception 'create_jubah_custom_quote campus validation was not found'; end if;
  execute v_widened;
end;
$migration$;

-- Persist the correct full university name when a claimed quote creates its
-- booking. Multi-campus universities retain the campus suffix.
create or replace function public.enforce_jubah_custom_quote_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare q public.jubah_custom_quotes%rowtype; v_name text;
begin
  if new.custom_quote_id is null then return new; end if;
  select * into q from public.jubah_custom_quotes where id = new.custom_quote_id;
  if not found or q.campus is null or q.customer_phone is null then raise exception 'Invalid custom quote'; end if;
  new.hp_number := q.customer_phone;
  new.campus := q.campus;
  v_name := case q.university_key
    when 'umpsa' then 'Universiti Malaysia Pahang Al-Sultan Abdullah'
    when 'uitm' then 'Universiti Teknologi MARA'
    when 'umk' then 'Universiti Malaysia Kelantan'
    when 'ukm' then 'Universiti Kebangsaan Malaysia'
    when 'uiam' then 'Universiti Islam Antarabangsa Malaysia'
    when 'uum' then 'Universiti Utara Malaysia'
    when 'unisza' then 'Universiti Sultan Zainal Abidin'
    when 'utp' then 'Universiti Teknologi PETRONAS'
    when 'upm' then 'Universiti Putra Malaysia'
    when 'um' then 'Universiti Malaya'
    when 'upsi' then 'Universiti Pendidikan Sultan Idris'
    when 'ums' then 'Universiti Malaysia Sabah'
    when 'unimas' then 'Universiti Malaysia Sarawak'
  end;
  if q.university_key in ('umpsa','uitm','umk','uiam','unisza','upm','upsi','ums','unimas') then
    v_name := v_name || ' (' || q.campus || ')';
  end if;
  new.university := v_name;
  new.university_key := q.university_key;
  return new;
end;
$$;

-- Extend scoped faculty administration to the new campuses.
drop policy if exists "read_active_jubah_faculties" on public.jubah_faculties;
create policy "read_active_jubah_faculties" on public.jubah_faculties for select using (
  is_active or public.get_my_role() = 'superadmin' or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
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
        when p.campus in ('Kota Kinabalu','Labuan International','Sandakan') then 'ums'
        when p.campus in ('Barat','Timur','Bandar') then 'unimas'
      end
  )
);

drop policy if exists "manage_scoped_jubah_faculties" on public.jubah_faculties;
create policy "manage_scoped_jubah_faculties" on public.jubah_faculties for all to authenticated
using (
  public.get_my_role() = 'superadmin' or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
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
        when p.campus in ('Kota Kinabalu','Labuan International','Sandakan') then 'ums'
        when p.campus in ('Barat','Timur','Bandar') then 'unimas'
      end
  )
)
with check (
  public.get_my_role() = 'superadmin' or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
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
        when p.campus in ('Kota Kinabalu','Labuan International','Sandakan') then 'ums'
        when p.campus in ('Barat','Timur','Bandar') then 'unimas'
      end
  )
);
