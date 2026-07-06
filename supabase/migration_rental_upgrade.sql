-- ============================================================
-- Migration: Rental system upgrade (v2)
-- - rental_vehicles: operating hours + night surcharge
-- - rental_bookings: license_url, end_date, booking_type
-- - RLS: customer can cancel own pending + upload license
-- - Storage: rental-licenses bucket
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. rental_vehicles: operating hours + night surcharge
ALTER TABLE public.rental_vehicles
  ADD COLUMN IF NOT EXISTS operating_start      int           NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS operating_end        int           NOT NULL DEFAULT 22,
  ADD COLUMN IF NOT EXISTS night_surcharge_on   boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS night_surcharge_rate numeric(10,2) NOT NULL DEFAULT 0;

-- 2. rental_bookings: license doc, multi-day support, booking type
ALTER TABLE public.rental_bookings
  ADD COLUMN IF NOT EXISTS license_url  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS end_date     date,
  ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'hourly';

-- Backfill end_date for existing single-day bookings
UPDATE public.rental_bookings
  SET end_date = date
  WHERE end_date IS NULL;

-- 3. Allow customer to update their own PENDING booking
--    (self-cancel and license upload)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rental_bookings'
      AND policyname = 'customer updates own pending'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "customer updates own pending"
        ON public.rental_bookings FOR UPDATE
        USING (auth.uid() = customer_id AND status = 'pending')
    $policy$;
  END IF;
END $$;

-- 4. Storage: rental-licenses bucket (private, signed-URL access)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('rental-licenses', 'rental-licenses', false)
  ON CONFLICT (id) DO NOTHING;

-- Any authenticated user may upload (path scoped to booking UUID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'rental license upload'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "rental license upload"
        ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'rental-licenses' AND auth.uid() IS NOT NULL)
    $policy$;
  END IF;
END $$;

-- Authenticated users may read (access controlled via signed URL in app)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'rental license read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "rental license read"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'rental-licenses' AND auth.uid() IS NOT NULL)
    $policy$;
  END IF;
END $$;
