-- jubah_doc_fields: per-university configurable upload document fields
-- Admin edits labels/order via the admin sub-page; Jubah form reads them dynamically.

create table if not exists jubah_doc_fields (
  id            uuid        default gen_random_uuid() primary key,
  university_key text       not null,
  label         text        not null,
  hint          text,
  position      integer     not null default 0,
  created_at    timestamptz default now()
);

create index if not exists jubah_doc_fields_univ_pos
  on jubah_doc_fields (university_key, position);

-- Seed UMPSA defaults
insert into jubah_doc_fields (university_key, label, hint, position) values
  ('umpsa', 'OSCAR',             null,                                    1),
  ('umpsa', 'SKPG',              null,                                    2),
  ('umpsa', 'Konvo Slip',        null,                                    3),
  ('umpsa', 'IC (Front & Back)', 'Accepts PDF or image (JPG/PNG)',        4);

alter table jubah_doc_fields enable row level security;

-- Admins can do everything
create policy "jubah_doc_fields_admin_all" on jubah_doc_fields
  for all to authenticated
  using (
    exists (select 1 from users where id = auth.uid() and role in ('admin', 'superadmin'))
  )
  with check (
    exists (select 1 from users where id = auth.uid() and role in ('admin', 'superadmin'))
  );

-- All authenticated users can read (Jubah form needs this)
create policy "jubah_doc_fields_read" on jubah_doc_fields
  for select to authenticated
  using (true);
