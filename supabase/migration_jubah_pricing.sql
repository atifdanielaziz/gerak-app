-- ============================================================
-- Migration: Jubah pricing table (remark × service option matrix)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jubah_pricing (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  remark       text        NOT NULL CHECK (remark IN ('Master', 'PHD', 'Degree', 'Diploma')),
  payment_mode text        NOT NULL CHECK (payment_mode IN ('pickup', 'postage')),
  price        numeric(8,2) NOT NULL DEFAULT 0,
  UNIQUE (remark, payment_mode)
);

ALTER TABLE public.jubah_pricing ENABLE ROW LEVEL SECURITY;

-- Public read (anon + authenticated) — customer form needs prices without login
CREATE POLICY "jubah_pricing_read"
  ON public.jubah_pricing FOR SELECT
  USING (true);

-- Admin/superadmin can update prices
CREATE POLICY "jubah_pricing_update"
  ON public.jubah_pricing FOR UPDATE
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'superadmin'));

-- Seed default prices (same as current hardcoded: pickup=70, postage=90)
INSERT INTO public.jubah_pricing (remark, payment_mode, price) VALUES
  ('Master',  'pickup',  70.00),
  ('Master',  'postage', 90.00),
  ('PHD',     'pickup',  70.00),
  ('PHD',     'postage', 90.00),
  ('Degree',  'pickup',  70.00),
  ('Degree',  'postage', 90.00),
  ('Diploma', 'pickup',  70.00),
  ('Diploma', 'postage', 90.00)
ON CONFLICT (remark, payment_mode) DO NOTHING;

-- Public RPC to fetch all prices (callable by anon)
CREATE OR REPLACE FUNCTION public.get_jubah_pricing()
RETURNS SETOF public.jubah_pricing
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$ SELECT * FROM public.jubah_pricing ORDER BY remark, payment_mode; $$;
GRANT EXECUTE ON FUNCTION public.get_jubah_pricing() TO anon, authenticated;

-- Admin RPC to update a single price
CREATE OR REPLACE FUNCTION public.set_jubah_price(
  p_remark text,
  p_payment_mode text,
  p_price numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;
  UPDATE public.jubah_pricing
  SET price = p_price
  WHERE remark = p_remark AND payment_mode = p_payment_mode;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_jubah_price(text, text, numeric) TO authenticated;
