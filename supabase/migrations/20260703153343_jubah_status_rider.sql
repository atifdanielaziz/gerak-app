-- Add rider delivery status values + secure update RPC
ALTER TABLE public.jubah_bookings
  DROP CONSTRAINT IF EXISTS jubah_bookings_status_check;

ALTER TABLE public.jubah_bookings
  ADD CONSTRAINT jubah_bookings_status_check
  CHECK (status IN (
    'booked', 'processing', 'collected', 'at_hub',
    'picked_up', 'on_the_way', 'delivered', 'cancelled'
  ));

-- Secure RPC: assigned rider OR admin can update status
CREATE OR REPLACE FUNCTION public.update_jubah_booking_status(
  p_booking_id uuid,
  p_status     text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.jubah_bookings
    WHERE id = p_booking_id
      AND (rider_id = auth.uid() OR public.get_my_role() IN ('admin','superadmin'))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorised.');
  END IF;

  UPDATE public.jubah_bookings
     SET status = p_status
   WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_jubah_booking_status(uuid, text) TO authenticated;
