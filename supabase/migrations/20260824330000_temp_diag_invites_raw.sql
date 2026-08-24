create or replace function public.diag_invites_raw()
returns table(email text, can_drive boolean, used_at timestamptz, created_at timestamptz, id uuid)
language sql
security definer
set search_path to 'public'
as $$
  select di.email, di.can_drive, di.used_at, di.created_at, di.id
  from public.driver_invites di
  where di.email in (
    'bazlianabazilah02@gmail.com','adbahnf19@gmail.com','fuzilanod@gmail.com',
    'aslamhaziq123@gmail.com','ilhamrosli73@gmail.com'
  )
  order by di.email, di.created_at;
$$;
revoke all on function public.diag_invites_raw() from public, anon, authenticated;
grant execute on function public.diag_invites_raw() to anon;
