-- Temporary read-only diagnostic — to be dropped in a follow-up migration
-- once the driver-queue visibility bug is confirmed/fixed.
create or replace function public.diag_order_visibility()
returns table(
  kind text, name text, campus text, gender text, role text,
  status text, preferred_gender text, can_drive boolean
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  select 'order'::text, jb.customer_name, jb.campus, null::text, null::text,
         jb.status, jb.preferred_driver_gender, null::boolean
  from public.ride_orders jb
  where jb.customer_name ilike '%Asdam%'
  order by jb.created_at desc
  limit 3;

  return query
  select 'profile'::text, p.name, p.campus, p.gender, p.role,
         null::text, null::text, p.can_drive
  from public.profiles p
  where p.name ilike '%Akhbar%' or p.name ilike '%Asdam%';
end;
$$;
revoke all on function public.diag_order_visibility() from public, anon, authenticated;
grant execute on function public.diag_order_visibility() to anon;
