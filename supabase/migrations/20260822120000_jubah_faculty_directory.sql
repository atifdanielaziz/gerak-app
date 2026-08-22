-- University-scoped faculty directory used by the Jubah booking form.
create table if not exists public.jubah_faculties (
  id uuid primary key default gen_random_uuid(),
  university_key text not null check (university_key in ('umpsa','uitm','umk','ukm','uiam','uum','unisza')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (university_key, name)
);

create index if not exists jubah_faculties_university_order_idx
  on public.jubah_faculties (university_key, sort_order, name);

insert into public.jubah_faculties (university_key, name, sort_order)
select 'umpsa', name, ord - 1 from unnest(array[
  'FKOM','FIST','FTKKP','FTKMA','FTKEE','FTKA','FTKPM','FIM','PSM','PSK'
]) with ordinality as seeded(name, ord)
on conflict (university_key, name) do nothing;

insert into public.jubah_faculties (university_key, name, sort_order)
select 'ukm', name, ord - 1 from unnest(array[
  'Faculty of Islamic Studies (FPI)',
  'Faculty of Social Sciences and Humanities (FSSK)',
  'Faculty of Science and Technology (FST)',
  'Faculty of Medicine (PPUKM/HPKK)',
  'Faculty of Economics and Management (FEP)',
  'Faculty of Engineering and Built Environment (FKAB)',
  'Faculty of Education (FPEND)',
  'Faculty of Dentistry (FGG)',
  'Faculty of Health Sciences (FSK)',
  'Faculty of Information Science and Technology (FTSM)',
  'Faculty of Law (FUU)',
  'Faculty of Pharmacy (FF)'
]) with ordinality as seeded(name, ord)
on conflict (university_key, name) do nothing;

alter table public.jubah_faculties enable row level security;

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
        end
    )
  );

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
        end
    )
  );

grant select on public.jubah_faculties to anon, authenticated;
grant insert, update, delete on public.jubah_faculties to authenticated;

create or replace function public.touch_jubah_faculty_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists touch_jubah_faculty_updated_at on public.jubah_faculties;
create trigger touch_jubah_faculty_updated_at before update on public.jubah_faculties
for each row execute function public.touch_jubah_faculty_updated_at();

-- Historical bookings keep their stored faculty text. Referenced directory
-- entries are deactivated instead of deleted so reporting remains auditable.
create or replace function public.protect_referenced_jubah_faculty()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.jubah_bookings b
    where b.university_key = old.university_key and b.faculty = old.name
  ) then
    raise exception 'This faculty is used by historical bookings. Deactivate it instead.';
  end if;
  return old;
end;
$$;
drop trigger if exists protect_referenced_jubah_faculty on public.jubah_faculties;
create trigger protect_referenced_jubah_faculty before delete on public.jubah_faculties
for each row execute function public.protect_referenced_jubah_faculty();
