create or replace function public.diag_url_format()
returns table(fee_receipt_url text, license_url text)
language sql
security definer
set search_path to 'public'
as $$
  select fee_receipt_url, license_url
  from public.profiles
  where fee_receipt_url <> '' or license_url <> ''
  limit 3;
$$;
revoke all on function public.diag_url_format() from public, anon, authenticated;
grant execute on function public.diag_url_format() to anon;
