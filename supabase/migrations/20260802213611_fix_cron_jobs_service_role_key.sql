-- The project's service-role key format migrated from a legacy JWT to the
-- new sb_secret_* format at some point, but every cron.schedule() call that
-- authenticates to an edge function had the OLD JWT hardcoded into its
-- command text. Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') inside a function
-- now resolves to the new key, so the old JWT no longer matches — every one
-- of these jobs has been failing its own auth check (401 Unauthorized)
-- regardless of whatever else was wrong in the function it calls.
-- cron.schedule() upserts by job name, so re-scheduling with the same name
-- updates the existing job in place rather than creating a duplicate.
--
-- Authenticates via a Supabase Vault secret named 'cron_service_role_key'
-- rather than a literal key value — the raw key must never be committed to
-- a migration file. That secret is created out-of-band, once, directly
-- against the live database — not via a tracked migration.

select cron.schedule(
  'monthly-driver-reset',
  '0 0 1 * *',
  $$
  select net.http_post(
    url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/monthly-reset',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);

select cron.schedule(
  'jubah-expire-unpaid',
  '0 3 * * *',
  $$
  select net.http_post(
    url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/jubah-expire-unpaid',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);

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
