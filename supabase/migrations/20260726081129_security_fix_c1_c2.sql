-- ============================================================
-- Security fix: C-1 (anon PII leak on profiles) + C-2 (public
-- read of jubah-docs storage bucket)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Both confirmed live and exploitable via unauthenticated requests to the
-- public REST/Storage API using only the public anon key (see chat/audit
-- for reproduction). Both fixes below are purely restrictive — nothing
-- product-facing is removed, only the specific over-broad grants that
-- caused the leak.

-- ── C-1 ──────────────────────────────────────────────────────────────────
-- "read rental owner profiles" granted anon SELECT on the full profiles
-- row (ic_number, ic_url, license_url, email, matric_no, ...) for any
-- can_rent=true user, with no column restriction. RLS is row-level, not
-- column-level, so the fix is a curated view exposing only what
-- GerakRental.tsx's owner-browsing UI actually needs, in place of raw
-- table access.

drop policy if exists "read rental owner profiles" on public.profiles;

create or replace view public.rental_owner_public as
select id, name, phone, gerak_id, campus
from public.profiles
where can_rent = true;

grant select on public.rental_owner_public to anon, authenticated;

-- ── C-2 ──────────────────────────────────────────────────────────────────
-- "jubah_docs_select" granted {anon, authenticated} SELECT on the entire
-- jubah-docs bucket (qual = true, no ownership check) — confirmed live:
-- an unauthenticated request could list every booking's folder and
-- download every customer's IC photos and other documents.
--
-- Verified before dropping: the only legitimate readers are admin
-- ("jubah docs admin read") and the rider assigned to that specific
-- booking ("jubah docs rider read") — both already exist as correctly
-- scoped policies and are untouched by this migration. No customer-facing
-- code path reads these documents back (getJubahDocSignedUrl is only
-- called from AdminHome and RiderHome), so nothing customer-facing
-- depends on the policy being dropped here.
--
-- Upload (INSERT) policies are deliberately NOT touched in this pass —
-- Jubah.tsx generates the reference and uploads documents into that
-- folder BEFORE the jubah_bookings row is inserted, so an upload policy
-- scoped to "a real booking already exists with this reference" would
-- break every new booking. Tightening the upload side needs its own
-- design pass (e.g. a short-lived upload token) and is tracked
-- separately — it's a lower-severity issue (storage spam, not PII
-- exposure) than the read-side leak this migration closes.

drop policy if exists "jubah_docs_select" on storage.objects;
