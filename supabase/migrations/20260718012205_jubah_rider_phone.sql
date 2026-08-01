-- ============================================================
-- Migration: RPC for the Jubah booking confirmation screen's live-status
-- poller to fetch the assigned rider's phone (for the WhatsApp contact
-- button). jubah_bookings has no rider_phone column — the rider's phone
-- lives on profiles, reached via rider_id. A new, separate RPC is used
-- here (rather than modifying the existing track_jubah_booking) since
-- that function's live signature in the database no longer matches any
-- committed migration (it now also accepts p_matric_id/p_ic_number,
-- which isn't defined anywhere in this repo) — safer not to touch it
-- blind.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_jubah_booking_live_status(p_reference text)
RETURNS TABLE (status text, rider_name text, rider_phone text)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT jb.status, jb.rider_name, p.phone AS rider_phone
  FROM public.jubah_bookings jb
  LEFT JOIN public.profiles p ON p.id = jb.rider_id
  WHERE jb.reference = p_reference;
$$;

GRANT EXECUTE ON FUNCTION public.get_jubah_booking_live_status(text) TO anon, authenticated;
