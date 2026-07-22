-- ============================================================
-- Migration: Add email to get_jubah_receipt so it shows on the receipt
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

DROP FUNCTION IF EXISTS public.get_jubah_receipt(text, text);

CREATE FUNCTION public.get_jubah_receipt(
  p_reference text,
  p_ic_last4  text
) RETURNS TABLE (
  id uuid, reference text, full_name text, ic_number text, hp_number text, email text,
  campus text, faculty text, university text, matric_id text,
  remark text, status text, payment_mode text, rider_name text, rider_phone text,
  cost numeric, balance_due numeric, balance_paid boolean, balance_paid_at timestamptz,
  initial_paid boolean, initial_paid_at timestamptz,
  delivery_address text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent_count integer;
BEGIN
  DELETE FROM public.jubah_tracking_attempts WHERE attempted_at < now() - interval '1 minute';
  SELECT count(*) INTO v_recent_count FROM public.jubah_tracking_attempts;
  IF v_recent_count >= 80 THEN
    RAISE EXCEPTION 'Too many requests right now. Please wait a minute and try again.';
  END IF;
  INSERT INTO public.jubah_tracking_attempts DEFAULT VALUES;

  RETURN QUERY
  SELECT jb.id, jb.reference, jb.full_name,
         CASE
           WHEN jb.ic_number IS NULL THEN NULL
           WHEN length(regexp_replace(jb.ic_number, '\D', '', 'g')) < 6 THEN NULL
           ELSE substring(regexp_replace(jb.ic_number, '\D', '', 'g') FROM 1 FOR 6) || '-XX-XXXX'
         END AS ic_number,
         jb.hp_number, jb.email, jb.campus, jb.faculty, jb.university, jb.matric_id, jb.remark,
         jb.status, jb.payment_mode, jb.rider_name, p.phone AS rider_phone,
         jb.cost, jb.balance_due, jb.balance_paid, jb.balance_paid_at,
         jb.initial_paid, jb.initial_paid_at,
         jb.delivery_address, jb.created_at
  FROM public.jubah_bookings jb
  LEFT JOIN public.profiles p ON p.id = jb.rider_id
  WHERE jb.reference = p_reference
    AND right(regexp_replace(jb.ic_number, '\D', '', 'g'), 4) = p_ic_last4;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_receipt(text, text) TO anon, authenticated;
