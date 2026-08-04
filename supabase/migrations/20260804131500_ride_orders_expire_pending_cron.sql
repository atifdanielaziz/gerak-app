-- Pending Gerak Car orders had no timeout at all — a booking with zero
-- driver interest just sat forever with no signal to the customer that
-- anything was wrong. Auto-cancels any order still 'pending' 30+ minutes
-- after creation. Runs every 10 minutes so the actual delay before a
-- customer sees it expire stays close to the 30-minute mark, not smeared
-- across a whole day like the daily-cadence jobs.
--
-- Authenticates via the same Supabase Vault secret as the other cron jobs
-- ('cron_service_role_key') rather than a literal key value — see
-- 20260802213611_fix_cron_jobs_service_role_key.sql for why.
select cron.schedule(
  'ride-orders-expire-pending',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/ride-orders-expire-pending',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
