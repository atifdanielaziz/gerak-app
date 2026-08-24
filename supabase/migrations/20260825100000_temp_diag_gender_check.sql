create or replace function public.diag_gender_check()
returns table(name text, email text, gender text)
language sql
security definer
set search_path to 'public'
as $$
  select name, email, gender from public.profiles where email = 'atifdanielaziz@gmail.com';
$$;
revoke all on function public.diag_gender_check() from public, anon, authenticated;
grant execute on function public.diag_gender_check() to anon;
