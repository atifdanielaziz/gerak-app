-- ============================================================
-- Migration: Raise jubah-docs bucket limit to 20 MB
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Each customer document is still capped at 5 MB by the app (Jubah.tsx
-- MAX_UPLOAD_BYTES, jubahDocs.ts replace upload). But the Combined PDF
-- merges all four, so it can pass 5 MB on its own — JUB-26-UMPSA-5GVF6S
-- (a ~5 MB IC scan) never got one, and the jubah-doc-combine fallback hit
-- the same bucket limit. 20 MB covers four 5 MB sources.

update storage.buckets set file_size_limit = 20971520 where id = 'jubah-docs';
