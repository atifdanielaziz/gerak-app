-- ============================================================
-- Gender setup — profiles.gender + get_my_gender() helper
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Self-reported, same trust level as name/phone — no verification, no
-- privileged-column protection needed (protect_privileged_profile_columns()
-- in 20260707194602 only pins genuinely admin-gated fields; this one stays
-- freely self-editable, same as it already lets name/phone through).
--
-- Required going forward at Register.tsx sign-up; existing accounts add it
-- later via a self-serve Profile.tsx row — nullable, no backfill, no forced
-- migration prompt.

alter table public.profiles
  add column if not exists gender text check (gender in ('male', 'female'));

-- Mirrors get_my_role()/get_my_campus() immediately below them in
-- 20260614022929_ride_orders.sql — same security-definer-stable pattern,
-- used by the ride_orders gender-preference RLS/RPC added next.
create or replace function public.get_my_gender()
returns text language sql security definer stable as $$
  select gender from public.profiles where id = auth.uid();
$$;
grant execute on function public.get_my_gender() to authenticated;
