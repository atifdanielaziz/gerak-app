-- ============================================================
-- Migration: Gerak Transporter — multiple providers
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Follow-up to migration_transporter_capability.sql (can_transport flag)
-- and migration_transporter_bookings.sql (the original single-hardcoded-
-- provider version). Gerak Transporter now lists every real profile with
-- can_transport = true instead of one hardcoded contact — same pattern
-- Gerak Rental already uses for its owner list (rental_owner_public).
--
-- IMPORTANT OPERATIONAL NOTE: "Khai Transporter" was never a real
-- registered account — it was hardcoded contact info in
-- GerakTransporter.tsx, not a profiles row. After this ships, the
-- Transporter page will show NO providers until an admin either invites
-- a new driver with the Transporter capability, or grants an existing
-- driver account can_transport = true via Staff management. If Khai
-- himself should keep appearing, he needs a real Gerak account with
-- that capability granted.

-- ── Public, minimal-column view of transporter providers ───────────────────
-- Same reasoning as rental_owner_public (see migration_security_fix_c1_c2.sql):
-- customers need to browse providers before logging in, but must never get
-- broad SELECT access to the real profiles table (ic_number, ic_url,
-- license_url, email, docs_status, etc.) to do it. vehicle/plate_number are
-- the same columns a driver already fills in for Gerak Car — reused here
-- rather than duplicating a second vehicle-registration flow.
create or replace view public.transporter_provider_public as
select id, name, phone, gerak_id, campus, vehicle, plate_number
from public.profiles
where can_transport = true;

grant select on public.transporter_provider_public to anon, authenticated;

-- ── transporter_bookings — reference a real provider instead of a
-- hardcoded default ──────────────────────────────────────────────────────
-- provider_name/provider_phone stay as columns (snapshotted at booking
-- time, same treatment as customer_name/contact already get) so a
-- booking's record doesn't silently change if the provider edits their
-- profile later — provider_id is what's actually used to look them up
-- and to filter/join going forward.
alter table public.transporter_bookings
  add column if not exists provider_id uuid references auth.users(id);

alter table public.transporter_bookings
  alter column provider_name drop default,
  alter column provider_phone drop default;

-- ── create_transporter_booking — take p_provider_id, look up their name/
-- phone server-side (never trust client-supplied provider identity),
-- and confirm they're actually a live provider right now.
create or replace function public.create_transporter_booking(
  p_provider_id uuid, p_services text[], p_pickup text, p_destination text, p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id     uuid := auth.uid();
  v_customer_name   text;
  v_contact         text;
  v_provider_name   text;
  v_provider_phone  text;
  v_provider_active boolean;
  v_booking_id      uuid;
  v_service         text;
  v_allowed         text[] := array['motorcycle', 'pindah_barang'];
begin
  if v_customer_id is null then
    return jsonb_build_object('success', false, 'error', 'You must be logged in to book.');
  end if;

  select name, phone, coalesce(can_transport, false)
    into v_provider_name, v_provider_phone, v_provider_active
  from public.profiles where id = p_provider_id;

  if v_provider_name is null or not v_provider_active then
    return jsonb_build_object('success', false, 'error', 'This provider is no longer available.');
  end if;

  if p_services is null or array_length(p_services, 1) is null then
    return jsonb_build_object('success', false, 'error', 'Select at least one service.');
  end if;

  foreach v_service in array p_services loop
    if not (v_service = any(v_allowed)) then
      return jsonb_build_object('success', false, 'error', 'Invalid service selected.');
    end if;
  end loop;

  if coalesce(trim(p_pickup), '') = '' or coalesce(trim(p_destination), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Pickup and destination are required.');
  end if;

  if length(p_pickup) > 200 or length(p_destination) > 200 or length(coalesce(p_notes, '')) > 500 then
    return jsonb_build_object('success', false, 'error', 'One of the fields is too long.');
  end if;

  select name, phone into v_customer_name, v_contact
  from public.profiles where id = v_customer_id;

  insert into public.transporter_bookings
    (customer_id, customer_name, contact, services, pickup, destination, notes, provider_id, provider_name, provider_phone)
  values (
    v_customer_id,
    coalesce(v_customer_name, 'Student'),
    coalesce(v_contact, ''),
    p_services,
    trim(p_pickup),
    trim(p_destination),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_provider_id,
    v_provider_name,
    coalesce(v_provider_phone, '')
  )
  returning id into v_booking_id;

  return jsonb_build_object('success', true, 'id', v_booking_id);
end;
$$;
grant execute on function public.create_transporter_booking(uuid, text[], text, text, text) to authenticated;

-- Old 4-arg signature (no provider) is no longer callable from anywhere in
-- the app — drop it so a stray cached client build fails loudly instead of
-- silently booking against the old hardcoded defaults (which no longer
-- exist, now that provider_name/provider_phone have no default).
drop function if exists public.create_transporter_booking(text[], text, text, text);
