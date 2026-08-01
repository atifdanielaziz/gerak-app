-- ============================================================
-- Remove duplicate jubah-docs INSERT policy (hygiene, not a fix)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- "jubah_docs_insert" and "jubah docs upload" both expressed the exact
-- same predicate (with_check: bucket_id = 'jubah-docs', same roles) —
-- harmless redundancy, not a vulnerability, but leftover cruft from an
-- earlier migration. Keeping the one with the documented rationale
-- (migration_jubah_docs_storage_fix.sql).

drop policy if exists "jubah_docs_insert" on storage.objects;
