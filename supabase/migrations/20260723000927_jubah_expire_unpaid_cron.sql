-- ============================================================
-- Migration: Schedule daily auto-cancel of abandoned Jubah bookings
-- Cancels bookings still at status='ordered' (nothing paid at all) once
-- they're older than the Edge Function's GRACE_DAYS (currently 7), and
-- deletes their uploaded documents to reclaim storage. Deposit-paid
-- bookings with an outstanding balance are untouched — real money is
-- already involved there, so that stays a human decision.
-- Run in: Supabase Dashboard > SQL Editor > New query
--
-- BEFORE RUNNING:
--   1. Deploy the jubah-expire-unpaid Edge Function via Supabase CLI:
--      supabase functions deploy jubah-expire-unpaid
--   2. Replace YOUR_SERVICE_ROLE_KEY below with your service role key
--      (found in Project Settings > API)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('jubah-expire-unpaid')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'jubah-expire-unpaid'
);

-- Runs daily at 03:00 UTC (11:00 AM MYT) — off-peak, well clear of any
-- live booking activity.
SELECT cron.schedule(
  'jubah-expire-unpaid',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/jubah-expire-unpaid',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Verify it was created
SELECT jobid, jobname, schedule, command FROM cron.job WHERE jobname = 'jubah-expire-unpaid';
