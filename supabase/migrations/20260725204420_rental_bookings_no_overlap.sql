-- ============================================================
-- Migration: prevent double-booking a rental vehicle at the database level
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- ROOT CAUSE (verified against the live schema, not assumed):
-- handleBook() in GerakRental.tsx inserts directly into rental_bookings
-- with zero server-side validation — the RLS "customer creates" policy's
-- entire check is `auth.uid() = customer_id`, and the table itself has
-- only a primary key and two foreign keys (confirmed via pg_constraint).
-- The only thing standing between "available" and "double-booked" is the
-- client's own canBookSlot() check against `existingBooks`, a snapshot
-- fetched once when the vehicle/month was selected (loadAvailability) —
-- never re-fetched at the moment of insert. Two customers who load the
-- page even seconds apart, both see the slot as free, and both pass the
-- client check and insert successfully. No amount of "check again right
-- before inserting" client-side logic actually closes this — it's a
-- textbook TOCTOU race, and only the database itself can close it
-- atomically under real concurrency.
--
-- FIX: a GiST exclusion constraint — Postgres refuses, at the storage
-- layer, to commit two active bookings for the same owner whose time
-- ranges overlap, no matter how close together the two INSERTs land.

create extension if not exists btree_gist;

-- Defensive: the app only ever generates half-hour-aligned values (HOURS
-- array steps by 0.5 throughout GerakRental.tsx), but nothing currently
-- enforces that at the database level. The slot-range math below assumes
-- it — a stray non-half-hour value would silently round rather than error,
-- so make the assumption an explicit, enforced fact instead of an implicit
-- one relied on but never checked (the exact anti-pattern found repeatedly
-- elsewhere in this codebase this session).
alter table public.rental_bookings
  add constraint rental_bookings_start_hour_half_hour check (start_hour * 2 = round(start_hour * 2)),
  add constraint rental_bookings_duration_half_hour   check (duration   * 2 = round(duration   * 2)),
  add constraint rental_bookings_positive_duration    check (duration > 0);

-- Represents every booking as a range of half-hour slots on a single
-- continuous timeline (day-index * 48 + half-hour-index), so an hourly
-- booking (a fraction of one day) and a full-day/multi-day booking (a
-- whole span of days) can be compared for overlap with one consistent
-- range type, regardless of which shape either one is.
--
-- Hourly: occupies [start, start+duration] inclusive of both ends — matches
-- bookedHoursOn()'s existing `for (h = start; h <= end; h += 0.5)` exactly,
-- which is why "next available = end + 0.5" (a 30-min gap) was already the
-- documented behavior; int4range's canonical form ([start, end+1)) reproduces
-- that inclusive-end semantic precisely, not an approximation of it.
-- Full-day: occupies every slot of every day from date through end_date.
alter table public.rental_bookings
  add column if not exists slot_range int4range generated always as (
    case
      when booking_type = 'fullday' then
        int4range(
          ((date - date '2000-01-01') * 48)::int,
          ((coalesce(end_date, date) - date '2000-01-01' + 1) * 48)::int,
          '[)'
        )
      else
        int4range(
          ((date - date '2000-01-01') * 48 + start_hour * 2)::int,
          ((date - date '2000-01-01') * 48 + (start_hour + duration) * 2 + 1)::int,
          '[)'
        )
    end
  ) stored;

-- Only 'pending' and 'confirmed' bookings actually occupy a slot — matches
-- loadAvailability()'s own .in('status', ['pending','confirmed']) filter
-- exactly (confirmed against the live app's four real status values:
-- pending/confirmed/cancelled/completed). A cancelled booking frees the
-- slot; a completed one is already in the past and was never guarded
-- against here to begin with.
alter table public.rental_bookings
  add constraint rental_bookings_no_overlap
  exclude using gist (
    owner_id with =,
    slot_range with &&
  )
  where (status in ('pending', 'confirmed'));
