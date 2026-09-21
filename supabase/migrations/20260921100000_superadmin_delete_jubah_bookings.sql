-- jubah_bookings only ever had ONE delete policy — jubah_lead_can_manage_
-- university(university_key), added in 20260825150000_jubah_lead_role.sql
-- for Leads. Superadmin got read/update policies at the same time but no
-- matching delete policy, so both the pre-existing per-booking Delete
-- button (JubahCustomerSubTab, gated on isSuperAdmin || isJubahLead) and
-- the new Customer Details Remove button (superadmin-only) have been
-- silently no-op-ing for superadmin: supabase-js's delete() with no
-- .select() reports success even when RLS filters the row out of the
-- delete's own USING clause, so the UI shows "deleted" while the row
-- never actually goes away. Every "delete" that worked this session went
-- through a direct database query (elevated access), not the app itself.

drop policy if exists superadmin_delete_jubah_bookings on public.jubah_bookings;
create policy superadmin_delete_jubah_bookings on public.jubah_bookings
  for delete
  using (public.get_my_role() = 'superadmin');
