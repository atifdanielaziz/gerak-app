-- ============================================================
-- Close direct-UPDATE privilege escalation on jubah_bookings
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- CONFIRMED LIVE, not assumed: every column on jubah_bookings (cost,
-- status, balance_paid, rider_commission_amount, initial_paid, ...) had a
-- column-level UPDATE grant to `authenticated` (and even `anon`, though
-- RLS happens to block anon since no row policy ever resolves true for a
-- NULL auth.uid()). Combined with the "rider_update_own_jubah_bookings"
-- RLS policy (qual: rider_id = auth.uid(), no column restriction — RLS
-- only restricts rows, never columns), any rider could call PostgREST's
-- update endpoint directly on their own assigned booking and set ANY
-- column to anything: mark balance_paid = true without ever submitting
-- payment, jump status straight to 'delivered' skipping every transition
-- check, or fabricate their own rider_commission_amount. None of the
-- guardrails in update_jubah_booking_status / mark_jubah_balance_paid
-- (transition validation, admin-only balance confirmation, real
-- commission calculation) apply to a direct table write — those only
-- exist inside the RPCs.
--
-- Verified via grep before writing this fix: no legitimate app code path
-- (RiderHome.tsx included) ever calls .update() on this table directly as
-- a rider — every real rider mutation already goes through
-- update_jubah_booking_status, a SECURITY DEFINER RPC owned by `postgres`
-- (confirmed: table owner, prosecdef=true), which bypasses RLS/grants
-- entirely and enforces its own ownership + state-machine checks. So
-- dropping the row policy that made this reachable has zero functional
-- impact on any real user flow.
--
-- The one real direct-update path (AdminHome.tsx toggling
-- needs_reconciliation) stays working — admin_update_jubah_bookings is
-- untouched, and the column grant below narrows what even admin's direct
-- REST access can touch, so everything else stays RPC-only for every role.

drop policy if exists "rider_update_own_jubah_bookings" on public.jubah_bookings;

revoke update on public.jubah_bookings from authenticated, anon;
grant update (needs_reconciliation) on public.jubah_bookings to authenticated;
