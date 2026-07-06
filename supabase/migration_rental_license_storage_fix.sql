-- ============================================================
-- Migration: Fix rental-licenses storage exposure
-- The original policies from migration_rental_upgrade.sql only checked
-- auth.uid() IS NOT NULL — any logged-in user could view or overwrite
-- ANY other user's uploaded driving license, since license files are
-- stored at {bookingId}/license.{ext} and booking IDs aren't secret.
-- This replaces them with ownership-checked policies, matching the
-- pattern already used correctly by the driver-documents bucket.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

drop policy if exists "rental license upload" on storage.objects;
drop policy if exists "rental license read" on storage.objects;

-- Upload/replace: only the renter who owns this specific booking
create policy "rental license upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'rental-licenses'
    and exists (
      select 1 from public.rental_bookings b
      where b.id::text = (storage.foldername(name))[1]
        and b.customer_id = auth.uid()
    )
  );

-- Needed because the app uploads with { upsert: true } — Supabase Storage's
-- upsert path requires an update policy once an object already exists at
-- that path, not just insert. The original migration didn't have one.
create policy "rental license update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'rental-licenses'
    and exists (
      select 1 from public.rental_bookings b
      where b.id::text = (storage.foldername(name))[1]
        and b.customer_id = auth.uid()
    )
  );

-- Read: the renter themselves, the vehicle owner (needs to verify it to
-- approve the booking), or an admin/superadmin
create policy "rental license read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'rental-licenses'
    and exists (
      select 1 from public.rental_bookings b
      where b.id::text = (storage.foldername(name))[1]
        and (b.customer_id = auth.uid() or b.owner_id = auth.uid() or public.get_my_role() in ('admin', 'superadmin'))
    )
  );
