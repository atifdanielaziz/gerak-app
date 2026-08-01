-- ============================================================
-- Migration: Superadmin write access to driver-documents (for one-off
-- watermark backfill of already-uploaded IC/license documents)
-- Existing policies only let a driver read/write their OWN documents, and
-- admin/superadmin READ any document (migration_driver_documents.sql) —
-- neither lets an admin overwrite another user's file. Scoped to
-- superadmin only (not admin), since overwriting a document is more
-- sensitive than viewing one.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create policy "superadmin_write_all_docs"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'driver-documents' and public.get_my_role() = 'superadmin')
  with check (bucket_id = 'driver-documents' and public.get_my_role() = 'superadmin');

create policy "superadmin_insert_all_docs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'driver-documents' and public.get_my_role() = 'superadmin');
