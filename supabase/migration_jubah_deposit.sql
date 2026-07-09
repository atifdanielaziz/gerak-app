-- ── Deposit payment support for jubah_bookings ──────────────────────────────

ALTER TABLE public.jubah_bookings
  ADD COLUMN IF NOT EXISTS balance_due          numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_paid         boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_proof_url    text,
  ADD COLUMN IF NOT EXISTS balance_submitted_at timestamptz;

-- ── Customer: submit balance payment proof ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_jubah_balance(
  p_reference         text,
  p_hp_number         text,
  p_balance_proof_url text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM   public.jubah_bookings
  WHERE  reference    = p_reference
    AND  hp_number    = p_hp_number
    AND  payment_mode = 'deposit'
    AND  balance_paid = false
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found or already paid.');
  END IF;

  UPDATE public.jubah_bookings
     SET balance_proof_url    = p_balance_proof_url,
         balance_submitted_at = now()
   WHERE id = v_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_jubah_balance(text, text, text) TO anon, authenticated;

-- ── Admin: mark balance as paid ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_jubah_balance_paid(
  p_booking_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE  id   = auth.uid()
      AND  role IN ('admin', 'superadmin')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorised.');
  END IF;

  UPDATE public.jubah_bookings
     SET balance_paid = true
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_jubah_balance_paid(uuid) TO authenticated;

-- ── Update track_jubah_booking to return deposit fields ───────────────────────
DROP FUNCTION IF EXISTS public.track_jubah_booking(text, text);

CREATE OR REPLACE FUNCTION public.track_jubah_booking(
  p_reference text DEFAULT NULL,
  p_hp_number text DEFAULT NULL
) RETURNS TABLE (
  id                   uuid,
  reference            text,
  full_name            text,
  hp_number            text,
  campus               text,
  faculty              text,
  remark               text,
  rider_name           text,
  status               text,
  payment_mode         text,
  balance_due          numeric,
  balance_paid         boolean,
  balance_proof_url    text,
  balance_submitted_at timestamptz,
  created_at           timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT jb.id, jb.reference, jb.full_name, jb.hp_number,
         jb.campus, jb.faculty, jb.remark, jb.rider_name,
         jb.status, jb.payment_mode,
         jb.balance_due, jb.balance_paid,
         jb.balance_proof_url, jb.balance_submitted_at,
         jb.created_at
  FROM   public.jubah_bookings jb
  WHERE  (p_reference IS NULL OR jb.reference = p_reference)
    AND  (p_hp_number IS NULL OR jb.hp_number = p_hp_number)
  ORDER BY jb.created_at DESC
  LIMIT  10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_jubah_booking(text, text) TO anon, authenticated;
