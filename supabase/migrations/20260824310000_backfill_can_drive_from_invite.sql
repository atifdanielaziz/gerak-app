-- One-time backfill for a since-fixed bug in the invite-application flow
-- (registrations between 2026-07-01 and 2026-07-05, GRK0051-GRK0055): the
-- invite correctly had can_drive = true, but the profile row that got
-- created from it ended up with can_drive = false, silently blocking these
-- 5 already-approved, already-active drivers from ever seeing the job
-- pool. Every driver who registered after this window has the correct
-- value, so the underlying bug is not reintroduced here — this only
-- corrects the handful of profiles a since-fixed version of that flow
-- already left behind.
--
-- Scoped tightly: only flips can_drive false -> true, only where the
-- profile's OWN invite already said true (i.e. correcting a bug, not
-- granting new authorization), only for role='driver'. Confirmed via
-- diagnostic query before this migration: exactly 5 profiles match, no
-- broader mismatch exists.
update public.profiles p
set can_drive = true
from public.driver_invites di
where di.email = p.email
  and p.role = 'driver'
  and p.can_drive = false
  and di.can_drive = true;
