-- A customer may see only the public digital-card fields of the driver
-- assigned to their own ride. This avoids granting broad profiles access.
create or replace function public.get_assigned_driver_profile(p_order_id uuid)
returns table (
  name text,
  role text,
  phone text,
  vehicle text,
  status text,
  avatar_url text,
  gerak_id text,
  can_drive boolean,
  can_rent boolean,
  can_transport boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.name,
    p.role,
    p.phone,
    p.vehicle,
    p.status,
    p.avatar_url,
    p.gerak_id,
    coalesce(p.can_drive, false),
    coalesce(p.can_rent, false),
    coalesce(p.can_transport, false)
  from public.ride_orders ro
  join public.profiles p on p.id = ro.driver_id
  where ro.id = p_order_id
    and ro.customer_id = auth.uid()
    and ro.driver_id is not null
  limit 1;
$$;

revoke all on function public.get_assigned_driver_profile(uuid) from public, anon;
grant execute on function public.get_assigned_driver_profile(uuid) to authenticated;
