-- ============================================================
-- Migration: Version for Jubah payment QR images
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- QR images were uploaded with Cache-Control max-age=1 year and replaced
-- in place at the same path, so customers' browsers kept showing the old
-- QR after superadmin uploaded a new one. The page now appends ?v=<this>
-- to the URL, which changes whenever the object is replaced.
-- Only reads jubah-qr (already a public bucket), and only the timestamp.

create or replace function public.get_jubah_qr_version(p_path text)
returns bigint
language sql stable security definer
set search_path to 'public'
as $$
  select floor(extract(epoch from coalesce(o.updated_at, o.created_at)))::bigint
  from storage.objects o
  where o.bucket_id = 'jubah-qr' and o.name = p_path;
$$;
revoke all on function public.get_jubah_qr_version(text) from public;
grant execute on function public.get_jubah_qr_version(text) to anon, authenticated;
