-- Gerak Car (ride_orders) had no retention policy at all — completed and
-- cancelled bookings, including customer name/phone/pickup/destination and
-- (since the previous migration) precise GPS coordinates, were kept
-- forever. Runs daily, same cadence as jubah-expire-unpaid, at a different
-- hour to avoid overlapping cron ticks.
--
-- Authenticates via a Supabase Vault secret named 'cron_service_role_key'
-- rather than a literal key value — the raw key must never be committed to
-- a migration file (GitHub's push protection blocks this, and rightly so).
-- That secret is created out-of-band, once, directly against the live
-- database — not via a tracked migration.
select cron.schedule(
  'ride-orders-retention',
  '0 4 * * *',
  $$
  select net.http_post(
    url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/ride-orders-retention',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
