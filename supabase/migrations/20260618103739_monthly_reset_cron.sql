-- ============================================================
-- Migration: Schedule monthly driver reset via pg_cron
-- Run in: Supabase Dashboard > SQL Editor > New query
--
-- BEFORE RUNNING:
--   1. Deploy the monthly-reset Edge Function via Supabase CLI:
--      supabase functions deploy monthly-reset
--   2. Replace YOUR_PROJECT_REF below with your Supabase project ref
--      (found in Project Settings > General)
--   3. Replace YOUR_SERVICE_ROLE_KEY with your service role key
--      (found in Project Settings > API)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove old schedule if it exists
SELECT cron.unschedule('monthly-driver-reset')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'monthly-driver-reset'
);

-- Schedule: runs at 00:00 UTC on the 1st of every month
SELECT cron.schedule(
  'monthly-driver-reset',
  '0 0 1 * *',
  $$
  SELECT net.http_post(
    url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/monthly-reset',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verify it was created
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'monthly-driver-reset';
