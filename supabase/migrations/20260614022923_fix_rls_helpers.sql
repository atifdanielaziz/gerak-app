-- ============================================================
-- Migration: harden RLS helper functions
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Re-create get_my_role with set search_path and stable cache hint
create or replace function public.get_my_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;
grant execute on function public.get_my_role() to authenticated;

-- Re-create get_my_campus with set search_path
create or replace function public.get_my_campus()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select campus from profiles where id = auth.uid();
$$;
grant execute on function public.get_my_campus() to authenticated;

-- Make the campus comparison in RLS case-insensitive
-- Drop and recreate the driver/admin read policy with lower() on both sides
drop policy if exists "staff_read_campus_ride_orders" on public.ride_orders;

create policy "staff_read_campus_ride_orders"
  on public.ride_orders for select
  using (
    public.get_my_role() in ('driver', 'admin', 'superadmin')
    and (
      public.get_my_role() = 'superadmin'
      or lower(public.get_my_campus()) = lower(campus)
    )
  );

-- Same for update policy
drop policy if exists "staff_update_ride_orders" on public.ride_orders;

create policy "staff_update_ride_orders"
  on public.ride_orders for update
  using (
    public.get_my_role() in ('driver', 'admin', 'superadmin')
    and (
      public.get_my_role() = 'superadmin'
      or lower(public.get_my_campus()) = lower(campus)
    )
  );
