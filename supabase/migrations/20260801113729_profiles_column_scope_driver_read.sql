-- ============================================================
-- Stop granting full profiles rows to drivers/rental owners — name+phone only
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- migration_profiles_scope_driver_read.sql correctly scoped the ride_orders/
-- rental_bookings grant to an actual relationship (not "any driver"), but
-- RLS is row-level, not column-level — the policy still hands over the
-- customer's FULL profile row to that driver/owner: ic_number, matric_no,
-- email, and critically license_url/ic_url, which store a Supabase Storage
-- SIGNED URL valid for 1 year (createSignedUrl(path, 60*60*24*365) in
-- DriverHome.tsx/RiderHome.tsx). A signed URL is self-authorizing — holding
-- it grants direct document download regardless of what the driver-documents
-- bucket's own RLS says. So the intended "let a driver see their current
-- customer's name/phone" grant was actually "let a driver download any past
-- customer's ID/license photo for a year."
--
-- Fix: a driver/owner's only legitimate need (DriverHome.tsx's admin
-- rental overview aside, which already has its own admin-role RLS bypass)
-- is name + phone + gerak_id for a customer they've actually transacted
-- with — same shape as the existing rental_owner_public view, but that one
-- is intentionally unscoped (any renter-eligible profile, browsable before
-- booking). This needs an actual per-caller relationship check, which a
-- plain view can't re-verify per query the way a SECURITY DEFINER function
-- can — same pattern used by every other RPC in this schema.

drop policy if exists "Staff can read all profiles" on public.profiles;

create policy "Staff can read all profiles"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.get_my_role() in ('admin', 'superadmin')
  );

-- Third instance of the exact same bug, found by actually listing every
-- policy on this table instead of assuming the two above were the only
-- ones: migration_rental_profile_rls.sql's "rental owner reads customer
-- profiles" independently grants a rental owner the customer's FULL row
-- (same ic_number/license_url exposure) for any booking they own — RLS
-- policies are OR'd together, so this kept the hole open even after both
-- fixes above. get_related_customers_public() below already covers this
-- exact relationship (rental_bookings owner_id = auth.uid()), making this
-- policy fully redundant as well as dangerous.
drop policy if exists "rental owner reads customer profiles" on public.profiles;

-- Second, worse instance of the same bug class, found while fixing the
-- first one: migration_gerak_rental.sql's "read rental owner profiles"
-- granted full rows (again including ic_number/license_url's 1-year
-- signed URL) for ANY profile with can_rent = true to literally anyone —
-- no relationship check at all, not even "has this person ever booked
-- them." The safe, intended replacement already exists and is already
-- used correctly by GerakRental.tsx: the rental_owner_public view
-- (id, name, phone, gerak_id only, migration_security_fix_c1_c2.sql).
-- This raw-table policy made that view pointless — same data, unrestricted,
-- one query away. Activity.tsx was the one remaining caller still going
-- through the raw table instead of the view; fixed alongside this drop.
drop policy if exists "read rental owner profiles" on public.profiles;

create or replace function public.get_related_customers_public(p_customer_ids uuid[])
returns table (id uuid, name text, phone text, gerak_id text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.phone, p.gerak_id
  from public.profiles p
  where p.id = any(p_customer_ids)
    and (
      auth.uid() = p.id
      or public.get_my_role() in ('admin', 'superadmin')
      or exists (
        select 1 from public.ride_orders o
        where o.customer_id = p.id and o.driver_id = auth.uid()
      )
      or exists (
        select 1 from public.rental_bookings r
        where r.customer_id = p.id and r.owner_id = auth.uid()
      )
    );
$$;

grant execute on function public.get_related_customers_public(uuid[]) to authenticated;
