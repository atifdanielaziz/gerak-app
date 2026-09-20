-- jubah_rider_assignments_rider_method_active enforced uniqueness on
-- (rider_id, method) alone — at most one active 'pickup' row and one
-- active 'postage' row PER RIDER, GLOBALLY, regardless of campus. That
-- predates multi-campus riders and made it impossible for a rider to be
-- e.g. postage at BOTH Pekan and Bangi: the moment the previous row-
-- targeting bug in set_rider_jubah_assignment was fixed, this constraint
-- surfaced as a real 23505 duplicate-key error the first time an admin
-- tried exactly that.
--
-- Widened to (rider_id, method, campus) — still prevents an accidental
-- duplicate row for the same rider+method+campus combo, but now allows
-- the same method across different campuses, which is the entire point
-- of a rider covering more than one.
drop index if exists public.jubah_rider_assignments_rider_method_active;
create unique index jubah_rider_assignments_rider_method_campus_active
  on public.jubah_rider_assignments (rider_id, method, campus)
  where (is_active = true);
