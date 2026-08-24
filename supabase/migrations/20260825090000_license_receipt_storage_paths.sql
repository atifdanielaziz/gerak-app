-- Fixes the "InvalidJWT: exp claim timestamp check failed" bug: license_url
-- (profiles, rental_bookings) is a Storage signed URL persisted once at
-- upload time and rendered as a static link forever, but signed URLs
-- expire (365 days here) — once that passes the link is permanently dead
-- with no recovery. fee_receipt_url has the exact same flaw (30-day
-- expiry, confirmed live on 2026-08-25 via a Receipts tab "View" click)
-- but fee_receipt_storage_path already exists (20260824150000) precisely
-- to let a fresh signed URL be generated on demand instead — this just
-- extends that same already-correct pattern to license_url everywhere it
-- was missing.
alter table public.profiles
  add column if not exists license_storage_path text not null default '';

alter table public.rental_bookings
  add column if not exists license_storage_path text not null default '';
