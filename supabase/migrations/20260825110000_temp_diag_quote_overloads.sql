create or replace function public.diag_quote_overloads()
returns table(args text, nargs int)
language sql
security definer
set search_path to 'public'
as $$
  select pg_get_function_identity_arguments(p.oid), p.pronargs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_jubah_custom_quote';
$$;
revoke all on function public.diag_quote_overloads() from public, anon, authenticated;
grant execute on function public.diag_quote_overloads() to anon;
