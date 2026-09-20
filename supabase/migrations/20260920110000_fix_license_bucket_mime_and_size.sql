-- Found the real cause of the "Upload failed. Please try again." reports:
-- both driver-documents and rental-licenses buckets only allow
-- image/jpeg + image/png at the storage layer, but their own upload UIs
-- explicitly invite more than that —
--   Profile.tsx's license input:  accept="image/*,.pdf"          (no client
--     mime allowlist at all, so any image/* — including webp — or a PDF
--     passes the client-side check and gets silently rejected by Storage)
--   GerakRental.tsx's license upload: ALLOWED_LICENSE_TYPES explicitly
--     includes 'image/webp' and 'application/pdf'
-- A scanned/exported driving license is very commonly a PDF or a phone
-- photo saved as webp — this was rejecting a large share of real uploads
-- with no useful error (upErr was never even logged to console).
--
-- Also raising file_size_limit to match what both pages already tell the
-- user in their own "File too large" message (10MB) — the bucket was
-- capped at 5MB, so a file between 5-10MB passed the client check and
-- failed identically at the Storage layer.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    file_size_limit     = 10485760
where id in ('driver-documents', 'rental-licenses');
