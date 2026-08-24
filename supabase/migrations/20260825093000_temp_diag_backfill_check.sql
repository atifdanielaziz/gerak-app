create or replace function public.diag_backfill_check()
returns table(
  fee_total bigint, fee_backfilled bigint,
  license_total bigint, license_backfilled bigint,
  rental_total bigint, rental_backfilled bigint
)
language sql
security definer
set search_path to 'public'
as $$
  select
    (select count(*) from public.profiles where fee_receipt_url <> ''),
    (select count(*) from public.profiles where fee_receipt_url <> '' and fee_receipt_storage_path <> ''),
    (select count(*) from public.profiles where license_url is not null and license_url <> ''),
    (select count(*) from public.profiles where license_url is not null and license_url <> '' and license_storage_path <> ''),
    (select count(*) from public.rental_bookings where license_url <> ''),
    (select count(*) from public.rental_bookings where license_url <> '' and license_storage_path <> '');
$$;
revoke all on function public.diag_backfill_check() from public, anon, authenticated;
grant execute on function public.diag_backfill_check() to anon;
