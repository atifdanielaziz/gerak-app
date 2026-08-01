-- ============================================================
-- Migration: Receipt Gate — global + per-user bypass
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Per-user exemption column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS receipt_gate_exempt boolean NOT NULL DEFAULT false;

-- 2. Global gate setting (default ON — normal behavior)
INSERT INTO public.app_settings (key, value)
  VALUES ('receipt_gate_active', 'true')
  ON CONFLICT (key) DO NOTHING;

-- 3. RPC: superadmin sets per-user exemption
CREATE OR REPLACE FUNCTION public.set_receipt_gate_exempt(
  p_user_id uuid,
  p_exempt  boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_role text;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role <> 'superadmin' THEN
    RAISE EXCEPTION 'Unauthorised: superadmin access required';
  END IF;

  UPDATE public.profiles
  SET receipt_gate_exempt = p_exempt
  WHERE id = p_user_id AND role IN ('driver', 'rider');
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_receipt_gate_exempt(uuid, boolean) TO authenticated;
