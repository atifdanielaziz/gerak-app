-- get_jubah_riders_directory_v2 (the landing page's public "Representative
-- Directory" preview, shown before a customer even starts booking) was
-- missed when the admin/superadmin/driver-as-rider parity fix went into
-- get_active_jubah_riders, set_rider_jubah_assignment and
-- create_custom_jubah_booking (20260920100000, 20260920120000). It still
-- required role = 'rider' strictly, so an account like Adib's or Atif's
-- (role driver/admin, can_robe = true) was correctly selectable inside the
-- actual booking flow but never showed up in this landing-page preview.

create or replace function public.get_jubah_riders_directory_v2(p_campuses text[])
returns table (
  id          uuid,
  name        text,
  drop_point  text,
  method      text,
  ic_number   text,
  phone       text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ja.id,
    p.name,
    ja.drop_point,
    ja.method,
    p.ic_number,
    p.phone
  from jubah_rider_assignments ja
  join profiles p on p.id = ja.rider_id
  where ja.campus    = any(p_campuses)
    and ja.is_active = true
    and p.role       in ('rider', 'driver', 'admin', 'superadmin')
    and p.can_robe   = true
    and p.status     = 'active'
  order by ja.created_at;
$$;

grant execute on function public.get_jubah_riders_directory_v2(text[]) to anon, authenticated;
