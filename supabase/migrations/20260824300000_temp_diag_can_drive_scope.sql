-- Temporary read-only diagnostic — dropped in a follow-up migration once
-- the scope/root-cause of the can_drive gap is confirmed.
create or replace function public.diag_can_drive_scope()
returns table(
  name text, gerak_id text, campus text, status text, docs_status text,
  can_drive boolean, profile_created_at timestamptz,
  invite_can_drive boolean, invite_used_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select p.name, p.gerak_id, p.campus, p.status, p.docs_status,
         p.can_drive, p.created_at,
         di.can_drive, di.used_at
  from public.profiles p
  left join public.driver_invites di on di.email = p.email
  where p.role = 'driver'
  order by p.can_drive asc, p.created_at desc;
$$;
revoke all on function public.diag_can_drive_scope() from public, anon, authenticated;
grant execute on function public.diag_can_drive_scope() to anon;
