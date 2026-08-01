-- ============================================================
-- Migration: jubah_bookings table — Jubah delivery order tracking
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jubah_bookings (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  reference     text        UNIQUE NOT NULL,
  customer_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name     text        NOT NULL,
  ic_number     text        NOT NULL,
  hp_number     text        NOT NULL,
  matric_id     text        NOT NULL,
  university    text        NOT NULL,
  campus        text        NOT NULL CHECK (campus IN ('Pekan', 'Gambang')),
  faculty       text        NOT NULL,
  remark        text        NOT NULL,
  payment_mode  text        NOT NULL CHECK (payment_mode IN ('pickup', 'postage')),
  cost          numeric(8,2) NOT NULL,
  rider_id      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  rider_name    text,
  status        text        NOT NULL DEFAULT 'booked'
                CHECK (status IN ('booked', 'picked_up', 'on_the_way', 'delivered', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jubah_bookings_campus  ON public.jubah_bookings (campus);
CREATE INDEX IF NOT EXISTS idx_jubah_bookings_rider    ON public.jubah_bookings (rider_id);
CREATE INDEX IF NOT EXISTS idx_jubah_bookings_hp       ON public.jubah_bookings (hp_number);
CREATE INDEX IF NOT EXISTS idx_jubah_bookings_reference ON public.jubah_bookings (reference);

ALTER TABLE public.jubah_bookings ENABLE ROW LEVEL SECURITY;

-- Customer: insert own + read own
CREATE POLICY "customer_insert_jubah_booking"
  ON public.jubah_bookings FOR INSERT
  WITH CHECK (auth.uid() = customer_id OR customer_id IS NULL);

CREATE POLICY "customer_read_own_jubah_booking"
  ON public.jubah_bookings FOR SELECT
  USING (auth.uid() = customer_id);

-- Admin/superadmin: full read + update (status, rider assignment)
CREATE POLICY "admin_read_all_jubah_bookings"
  ON public.jubah_bookings FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));

CREATE POLICY "admin_update_jubah_bookings"
  ON public.jubah_bookings FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- Rider: read bookings assigned to them, update status
CREATE POLICY "rider_read_own_jubah_bookings"
  ON public.jubah_bookings FOR SELECT
  TO authenticated
  USING (rider_id = auth.uid());

CREATE POLICY "rider_update_own_jubah_bookings"
  ON public.jubah_bookings FOR UPDATE
  TO authenticated
  USING (rider_id = auth.uid());

-- Public tracking lookup (future guest use) — read by reference or phone only,
-- via RPC below, not direct table access (keeps RLS strict).
CREATE OR REPLACE FUNCTION public.track_jubah_booking(p_reference text, p_hp_number text)
RETURNS SETOF public.jubah_bookings
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.jubah_bookings
  WHERE (p_reference IS NOT NULL AND reference = p_reference)
     OR (p_hp_number IS NOT NULL AND hp_number = p_hp_number)
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.track_jubah_booking(text, text) TO anon, authenticated;
