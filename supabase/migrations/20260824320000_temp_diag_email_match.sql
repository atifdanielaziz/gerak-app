create or replace function public.diag_email_match()
returns table(profile_email text, invite_email text, exact_match boolean, ci_match boolean)
language sql
security definer
set search_path to 'public'
as $$
  select p.email, di.email,
         (di.email = p.email),
         (lower(btrim(di.email)) = lower(btrim(p.email)))
  from public.profiles p
  left join public.driver_invites di on lower(btrim(di.email)) = lower(btrim(p.email))
  where p.role = 'driver' and p.can_drive = false;
$$;
revoke all on function public.diag_email_match() from public, anon, authenticated;
grant execute on function public.diag_email_match() to anon;
