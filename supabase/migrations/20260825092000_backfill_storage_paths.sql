-- One-time backfill: the storage path is embedded in every existing signed
-- URL already stored (.../sign/<bucket>/<path>?token=...) — extract it so
-- currently-still-valid links also benefit from on-demand regeneration,
-- not just uploads made after this fix ships. Only fills empty values;
-- never touches a path that's already correctly set.
update public.profiles
set fee_receipt_storage_path = regexp_replace(fee_receipt_url, '^.*/driver-receipts/([^?]+).*$', '\1')
where coalesce(fee_receipt_storage_path, '') = ''
  and fee_receipt_url like '%/driver-receipts/%';

update public.profiles
set license_storage_path = regexp_replace(license_url, '^.*/driver-documents/([^?]+).*$', '\1')
where coalesce(license_storage_path, '') = ''
  and license_url like '%/driver-documents/%';

update public.rental_bookings
set license_storage_path = regexp_replace(license_url, '^.*/rental-licenses/([^?]+).*$', '\1')
where coalesce(license_storage_path, '') = ''
  and license_url like '%/rental-licenses/%';
