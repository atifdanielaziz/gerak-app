-- ============================================================
-- Migration: Rider Jubah method + drop point assignment
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS jubah_method     text CHECK (jubah_method IN ('pickup', 'postage')),
  ADD COLUMN IF NOT EXISTS jubah_drop_point text;

CREATE INDEX IF NOT EXISTS idx_profiles_jubah_method
  ON public.profiles (role, campus, jubah_method)
  WHERE role = 'rider';

-- RPC: admin sets a rider's Jubah method + drop point
CREATE OR REPLACE FUNCTION public.set_rider_jubah_assignment(
  p_user_id    uuid,
  p_method     text,
  p_drop_point text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorised: admin or superadmin access required';
  END IF;

  UPDATE public.profiles
  SET jubah_method     = p_method,
      jubah_drop_point = p_drop_point
  WHERE id = p_user_id AND role = 'rider';
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_rider_jubah_assignment(uuid, text, text) TO authenticated;
