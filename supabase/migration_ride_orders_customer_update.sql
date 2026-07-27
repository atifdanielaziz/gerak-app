-- ============================================================
-- Migration: allow a customer to edit their own still-pending ride order
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Transport.tsx's "Edit Booking" flow has always updated ride_orders
-- directly from the client (.eq('id', submittedOrderId).eq('status',
-- 'pending')), but no RLS policy ever existed granting a customer UPDATE
-- access at all — only staff_update_ride_orders (driver/admin/superadmin)
-- did. Every edit attempt therefore matched 0 rows and fell into the
-- "A driver has accepted this ride" fallback message, even seconds after
-- booking with no driver anywhere near it. Scoped the same way the
-- client already assumed: own order, still pending.
create policy "customer_update_own_pending_ride_order"
  on public.ride_orders for update
  using (auth.uid() = customer_id and status = 'pending')
  with check (auth.uid() = customer_id and status = 'pending');
