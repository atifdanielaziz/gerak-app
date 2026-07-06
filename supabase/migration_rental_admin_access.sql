-- ============================================================
-- Migration: Admin full access to rental bookings
-- Superadmin/admin can view and update all rental bookings
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Allow admin/superadmin to read ALL rental bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rental_bookings'
      AND policyname = 'admin reads all rental bookings'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "admin reads all rental bookings"
        ON public.rental_bookings FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'superadmin')
          )
        )
    $policy$;
  END IF;
END $$;

-- Allow admin/superadmin to update (confirm/decline) any rental booking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rental_bookings'
      AND policyname = 'admin updates all rental bookings'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "admin updates all rental bookings"
        ON public.rental_bookings FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'superadmin')
          )
        )
    $policy$;
  END IF;
END $$;

-- Allow admin/superadmin to read rental_vehicles of all owners
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'rental_vehicles'
      AND policyname = 'admin reads all rental vehicles'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "admin reads all rental vehicles"
        ON public.rental_vehicles FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND role IN ('admin', 'superadmin')
          )
        )
    $policy$;
  END IF;
END $$;
