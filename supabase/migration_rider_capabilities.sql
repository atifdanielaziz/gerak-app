-- ============================================================
-- Migration: Rider capabilities — can_daily + can_robe
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Add capability columns to driver_invites
ALTER TABLE public.driver_invites
  ADD COLUMN IF NOT EXISTS can_daily boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_robe  boolean NOT NULL DEFAULT false;

-- 2. Add capability columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_daily boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_robe  boolean NOT NULL DEFAULT false;

-- 3. Update handle_new_user — carry can_daily + can_robe from invite to profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus    text;
  v_role      text;
  v_gerak_id  text;
  v_can_drive boolean := false;
  v_can_rent  boolean := false;
  v_can_daily boolean := false;
  v_can_robe  boolean := false;
  v_invite    public.driver_invites;
BEGIN
  -- Check for a pending invite (driver, rider, or admin)
  SELECT * INTO v_invite
  FROM public.driver_invites
  WHERE lower(email) = lower(new.email) AND NOT used;

  IF v_invite.id IS NOT NULL THEN
    v_role      := COALESCE(v_invite.role, 'driver');
    v_campus    := v_invite.campus;
    v_can_drive := COALESCE(v_invite.can_drive, false);
    v_can_rent  := COALESCE(v_invite.can_rent,  false);
    v_can_daily := COALESCE(v_invite.can_daily, false);
    v_can_robe  := COALESCE(v_invite.can_robe,  false);

    IF v_role = 'rider' THEN
      IF v_campus = 'Pekan' THEN
        v_gerak_id := 'GRP' || lpad(nextval('gerak_id_grp_seq')::text, 4, '0');
      ELSE
        v_gerak_id := 'GRG' || lpad(nextval('gerak_id_grg_seq')::text, 4, '0');
      END IF;
    ELSIF v_role = 'driver' THEN
      IF v_campus = 'Pekan' THEN
        v_gerak_id := 'GDP' || lpad(nextval('gerak_id_gdp_seq')::text, 4, '0');
      ELSE
        v_gerak_id := 'GDG' || lpad(nextval('gerak_id_gdg_seq')::text, 4, '0');
      END IF;
    ELSE
      -- Admin: use customer sequence as placeholder
      IF v_campus = 'Pekan' THEN
        v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
      ELSE
        v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
      END IF;
    END IF;

    -- Mark invite as used
    UPDATE public.driver_invites
      SET used = true, used_at = now()
      WHERE id = v_invite.id;

  ELSE
    -- Customer registration
    v_role   := 'customer';
    v_campus := COALESCE(new.raw_user_meta_data->>'campus', '');
    IF v_campus = 'Pekan' THEN
      v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
    ELSE
      v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
    END IF;
  END IF;

  INSERT INTO public.profiles
    (id, name, matric_no, email, phone, university, campus, role, points,
     gerak_id, can_drive, can_rent, can_daily, can_robe)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Student'),
    COALESCE(new.raw_user_meta_data->>'matric_no', ''),
    new.email,
    COALESCE(new.raw_user_meta_data->>'phone', ''),
    COALESCE(new.raw_user_meta_data->>'university', ''),
    v_campus,
    v_role,
    100,
    v_gerak_id,
    v_can_drive,
    v_can_rent,
    v_can_daily,
    v_can_robe
  );
  RETURN new;
END;
$$;

-- Re-wire trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
