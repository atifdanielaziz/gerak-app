-- ============================================================
-- Migration: Add a stable field_key to jubah_doc_fields
-- The table's `id` is a random UUID (gen_random_uuid()), so code that
-- needs to identify "the IC field" specifically (e.g. Jubah.tsx's PDF
-- watermark, which only stamps the IC page) could never match on `id`.
-- field_key is a separate, stable semantic identifier ('ic', 'oscar',
-- 'skpg', 'konvo') independent of the UUID primary key.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

alter table public.jubah_doc_fields add column if not exists field_key text;

update public.jubah_doc_fields set field_key = 'oscar' where label = 'OSCAR'             and field_key is null;
update public.jubah_doc_fields set field_key = 'skpg'  where label = 'SKPG'              and field_key is null;
update public.jubah_doc_fields set field_key = 'konvo' where label = 'Konvo Slip'        and field_key is null;
update public.jubah_doc_fields set field_key = 'ic'    where label = 'IC (Front & Back)' and field_key is null;
