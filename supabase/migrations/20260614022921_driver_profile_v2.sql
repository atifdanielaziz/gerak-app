-- ============================================================
-- Migration: driver online status + fee receipt + car segment
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. New columns on profiles
alter table public.profiles
  add column if not exists fee_receipt_url  text    not null default '';

-- 2. Storage bucket for fee receipts
-- Run this separately in Supabase Dashboard > Storage > New bucket:
--   Name: driver-receipts
--   Public: FALSE
--   Allowed MIME types: image/jpeg, image/png, image/webp
--
-- Then add storage policy (RLS):
insert into storage.buckets (id, name, public)
  values ('driver-receipts', 'driver-receipts', false)
  on conflict (id) do nothing;

-- Allow drivers to upload/read their own receipt
create policy "Drivers can upload own receipt"
  on storage.objects for insert
  with check (
    bucket_id = 'driver-receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Drivers can read own receipt"
  on storage.objects for select
  using (
    bucket_id = 'driver-receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Drivers can update own receipt"
  on storage.objects for update
  using (
    bucket_id = 'driver-receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
