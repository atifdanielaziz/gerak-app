-- ============================================================
-- Migration: Rider role — sequences, profile column, trigger,
--            invite check, and admin visibility
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Gerak ID sequences for Riders
--    GRP = Gerak Rider Pekan   e.g. GRP0001
--    GRG = Gerak Rider Gambang e.g. GRG0001
CREATE SEQUENCE IF NOT EXISTS gerak_id_grp_seq START 1;
CREATE SEQUENCE IF NOT EXISTS gerak_id_grg_seq START 1;

-- 2. rider_active column on profiles
--    Controls the online/offline toggle in Rider Hub
--    true  = Active  (visible & selectable by customers)
--    false = Inactive (faded/hidden from customer view)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rider_active boolean NOT NULL DEFAULT false;

-- 3. RPC: preview next rider Gerak ID (registration form)
CREATE OR REPLACE FUNCTION public.get_next_rider_gerak_id(p_campus text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_count  bigint;
  v_called boolean;
BEGIN
  IF p_campus = 'Pekan' THEN
    v_prefix := 'GRP';
    SELECT last_value, is_called INTO v_count, v_called FROM gerak_id_grp_seq;
  ELSE
    v_prefix := 'GRG';
    SELECT last_value, is_called INTO v_count, v_called FROM gerak_id_grg_seq;
  END IF;
  RETURN v_prefix || lpad((CASE WHEN v_called THEN v_count + 1 ELSE v_count END)::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_next_rider_gerak_id(text) TO anon, authenticated;

-- 4. Update check_driver_invite — return role so Register page
--    knows whether the invite is for driver or rider
CREATE OR REPLACE FUNCTION public.check_driver_invite(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.driver_invites;
BEGIN
  SELECT * INTO v_invite
  FROM public.driver_invites
  WHERE lower(email) = lower(p_email) AND NOT used;

  IF v_invite.id IS NULL THEN
    RETURN json_build_object('is_driver', false);
  END IF;

  RETURN json_build_object(
    'is_driver', true,
    'campus',    v_invite.campus,
    'role',      COALESCE(v_invite.role, 'driver')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_driver_invite(text) TO anon, authenticated;

-- 5. Update handle_new_user trigger — handle rider role
--    Riders get GRP/GRG Gerak IDs, status = inactive until fee paid
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campus   text;
  v_role     text;
  v_gerak_id text;
  v_invite   public.driver_invites;
BEGIN
  -- Check for a pending invite (driver or rider)
  SELECT * INTO v_invite
  FROM public.driver_invites
  WHERE lower(email) = lower(new.email) AND NOT used;

  IF v_invite.id IS NOT NULL THEN
    v_role   := COALESCE(v_invite.role, 'driver');
    v_campus := v_invite.campus;

    IF v_role = 'rider' THEN
      -- Rider Gerak ID: GRP / GRG
      IF v_campus = 'Pekan' THEN
        v_gerak_id := 'GRP' || lpad(nextval('gerak_id_grp_seq')::text, 4, '0');
      ELSE
        v_gerak_id := 'GRG' || lpad(nextval('gerak_id_grg_seq')::text, 4, '0');
      END IF;
    ELSE
      -- Driver Gerak ID: GDP / GDG
      IF v_campus = 'Pekan' THEN
        v_gerak_id := 'GDP' || lpad(nextval('gerak_id_gdp_seq')::text, 4, '0');
      ELSE
        v_gerak_id := 'GDG' || lpad(nextval('gerak_id_gdg_seq')::text, 4, '0');
      END IF;
    END IF;

    -- Mark invite used
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
    (id, name, matric_no, email, phone, university, campus, role, points, gerak_id)
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
    v_gerak_id
  );
  RETURN new;
END;
$$;

-- Re-wire trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. Update get_all_profiles — include riders alongside admins & drivers
CREATE OR REPLACE FUNCTION public.get_all_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.get_my_role() NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  RETURN QUERY
    SELECT * FROM public.profiles
    WHERE role IN ('admin', 'driver', 'rider')
    ORDER BY
      CASE role
        WHEN 'admin'  THEN 1
        WHEN 'driver' THEN 2
        WHEN 'rider'  THEN 3
        ELSE               4
      END,
      name;
END;
$$;
