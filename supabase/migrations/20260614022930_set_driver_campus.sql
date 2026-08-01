-- ============================================================
-- Migration: set_driver_campus RPC
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

create or replace function public.set_driver_campus(
  p_user_id uuid,
  p_campus  text
) returns void language plpgsql security definer as $$
begin
  update public.profiles
  set campus = p_campus
  where id = p_user_id;
end;
$$;

grant execute on function public.set_driver_campus(uuid, text) to authenticated;
