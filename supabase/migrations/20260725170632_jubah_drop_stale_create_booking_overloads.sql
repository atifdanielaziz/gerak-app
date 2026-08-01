-- ============================================================
-- Migration: drop stale create_jubah_booking overloads
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Postgres's CREATE OR REPLACE FUNCTION only replaces a function with the
-- EXACT same parameter list — adding a new parameter (p_university_key,
-- then later p_email) created a brand new overload each time rather than
-- replacing the old one. All three versions ended up live simultaneously:
--
--   22-arg (original)         — jubah_pricing lookup has NO university
--                                filter at all: SELECT price FROM
--                                jubah_pricing WHERE remark=... AND
--                                payment_mode=... across every university.
--   23-arg (+ university_key) — correctly filtered, but missing p_email.
--   24-arg (+ email)          — current, correct version the app actually
--                                calls (src/context/AppContext.tsx bookJubah).
--
-- PostgREST resolves an RPC call to whichever overload's parameter names
-- exactly match what's sent — so a raw call supplying only the 22 original
-- parameter names (omitting p_university_key) resolves straight to the
-- oldest, unfiltered version, callable by anyone (this booking flow allows
-- guests). With only UMPSA pricing configured today this is likely inert,
-- but it becomes a real underpayment path the moment a second university's
-- jubah_pricing rows exist — which is the explicit direction this app is
-- expanding in. Dropping both stale overloads; only the 24-arg version
-- (matching what the app actually calls) remains.
drop function if exists public.create_jubah_booking(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text,
  text, uuid
);

drop function if exists public.create_jubah_booking(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text,
  text, uuid, text
);
