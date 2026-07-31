-- ============================================================
-- Per-rider payment QR codes — jubah-qr bucket moves from one global
-- fixed path (qr.jpg) to one object per rider (qr-{riderId}.jpg)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Mirrors the bank-details change: the QR a customer scans needs to belong
-- to the rider they're actually paying, not a single shared image. QR
-- itself is treated as a display convenience, not the authoritative payment
-- record — it isn't snapshotted onto a booking the way rider_bank_* is,
-- it's always fetched live by rider_id. Public read is unchanged; write
-- access moves from "superadmin only" to "superadmin, or the rider writing
-- their own object path" — a rider can never touch another rider's QR.

drop policy if exists "jubah_qr_superadmin_insert" on storage.objects;
create policy "jubah_qr_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'jubah-qr'
    and (public.get_my_role() = 'superadmin' or name = 'qr-' || auth.uid()::text || '.jpg')
  );

drop policy if exists "jubah_qr_superadmin_update" on storage.objects;
create policy "jubah_qr_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'jubah-qr'
    and (public.get_my_role() = 'superadmin' or name = 'qr-' || auth.uid()::text || '.jpg')
  )
  with check (
    bucket_id = 'jubah-qr'
    and (public.get_my_role() = 'superadmin' or name = 'qr-' || auth.uid()::text || '.jpg')
  );

drop policy if exists "jubah_qr_superadmin_delete" on storage.objects;
create policy "jubah_qr_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'jubah-qr'
    and (public.get_my_role() = 'superadmin' or name = 'qr-' || auth.uid()::text || '.jpg')
  );
