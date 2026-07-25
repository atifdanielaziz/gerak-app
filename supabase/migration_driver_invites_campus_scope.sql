-- ============================================================
-- Migration: scope driver_invites RLS to campus for regular admins
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- The original "admin_all_invites" policy granted any admin/superadmin
-- unrestricted access to every campus's invites — every other admin-facing
-- table (ride_orders, jubah_bookings, etc) scopes regular admins to their
-- own campus and only exempts superadmin; this one was missed. A Pekan-only
-- admin could see and revoke Gambang's pending invites (and vice versa).
drop policy if exists "admin_all_invites" on public.driver_invites;

create policy "admin_all_invites"
  on public.driver_invites for all
  using (
    public.get_my_role() = 'superadmin'
    or (public.get_my_role() = 'admin' and lower(public.get_my_campus()) = lower(campus))
  )
  with check (
    public.get_my_role() = 'superadmin'
    or (public.get_my_role() = 'admin' and lower(public.get_my_campus()) = lower(campus))
  );
