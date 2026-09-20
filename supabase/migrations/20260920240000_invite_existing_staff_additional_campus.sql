-- apply_pending_invite() only ever fired for a brand-new 'customer' being
-- promoted into their first staff role, overwriting role/campus/capabilities
-- wholesale — which made zero sense for an ALREADY-staff account (e.g. a
-- driver with can_robe already true) invited again for a different Jubah
-- campus: the gate silently no-opped forever (their role was never
-- 'customer'), and even ignoring the gate, overwriting their existing
-- role/home campus would have destroyed their current assignment rather
-- than adding to it.
--
-- New behavior, additive only: an invite with role='rider' for an email
-- that already belongs to a non-customer profile now grants that account
-- an EXTRA jubah_rider_assignments row for the invited campus (defaulting
-- to 'pickup' — same as any assignment, editable afterward via Jubah >
-- Riders) and ensures can_robe=true, without touching their existing
-- role, home campus, or other capabilities. Every other combination
-- (admin/driver/jubah_lead invites for an already-staff email) keeps the
-- prior no-op behavior — those invite types have no well-defined
-- "additive" meaning here and weren't asked for.
--
-- The brand-new 'customer' promotion path below is untouched.

create or replace function public.apply_pending_invite()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_current_role text;
  v_can_robe boolean;
  v_invite public.driver_invites;
  v_gerak_id text;
  v_key text;
begin
  if v_uid is null then return jsonb_build_object('applied', false); end if;
  select role, can_robe into v_current_role, v_can_robe from public.profiles where id = v_uid;
  select email into v_email from auth.users where id = v_uid;
  if v_email is null then return jsonb_build_object('applied', false); end if;

  select * into v_invite from public.driver_invites
  where lower(email) = lower(v_email) and not used
  order by created_at desc limit 1;
  if v_invite.id is null then return jsonb_build_object('applied', false); end if;

  -- Additive grant for an existing staff member — see header comment.
  if v_current_role is distinct from 'customer' and v_invite.role = 'rider' then
    if not exists (
      select 1 from public.jubah_rider_assignments
      where rider_id = v_uid and campus = v_invite.campus and is_active = true
    ) then
      insert into public.jubah_rider_assignments (rider_id, campus, method, is_active)
      values (v_uid, v_invite.campus, 'pickup', true);
    end if;
    if not coalesce(v_can_robe, false) then
      perform set_config('app.applying_invite', 'true', true);
      update public.profiles set can_robe = true where id = v_uid;
    end if;
    update public.driver_invites set used = true, used_at = now() where id = v_invite.id;
    return jsonb_build_object('applied', true, 'role', 'rider', 'campus', v_invite.campus, 'additional_campus', true);
  end if;

  if v_current_role is distinct from 'customer' then return jsonb_build_object('applied', false); end if;

  v_gerak_id := 'GRK' || lpad(nextval('gerak_id_grk_seq')::text, 4, '0');

  if v_invite.role = 'jubah_lead' then
    perform set_config('app.applying_invite', 'true', true);
    update public.profiles set
      role = 'rider', campus = v_invite.campus,
      gerak_id = coalesce(nullif(gerak_id, ''), v_gerak_id),
      can_drive = false, can_rent = false, can_daily = false,
      can_robe = true, can_transport = false
    where id = v_uid;

    insert into public.jubah_leads(
      user_id, is_active, created_by, base_university_key, base_campus
    ) values (
      v_uid, true, v_invite.created_by,
      v_invite.jubah_lead_base_university_key, v_invite.campus
    )
    on conflict (user_id) do update set
      is_active = true,
      base_university_key = coalesce(public.jubah_leads.base_university_key, excluded.base_university_key),
      base_campus = coalesce(public.jubah_leads.base_campus, excluded.base_campus),
      updated_at = now();

    delete from public.jubah_lead_universities where lead_id = v_uid;
    foreach v_key in array v_invite.jubah_lead_university_keys loop
      insert into public.jubah_lead_universities(lead_id, university_key, assigned_by)
      values (v_uid, v_key, v_invite.created_by);
    end loop;

    update public.driver_invites set used = true, used_at = now() where id = v_invite.id;
    return jsonb_build_object(
      'applied', true, 'role', 'rider', 'jubah_lead', true,
      'campus', v_invite.campus,
      'base_university', v_invite.jubah_lead_base_university_key,
      'universities', to_jsonb(v_invite.jubah_lead_university_keys)
    );
  end if;

  perform set_config('app.applying_invite', 'true', true);
  update public.profiles set
    role = coalesce(v_invite.role, 'driver'), campus = v_invite.campus,
    gerak_id = v_gerak_id, can_drive = coalesce(v_invite.can_drive, false),
    can_rent = coalesce(v_invite.can_rent, false), can_daily = coalesce(v_invite.can_daily, false),
    can_robe = coalesce(v_invite.can_robe, false), can_transport = coalesce(v_invite.can_transport, false)
  where id = v_uid;
  update public.driver_invites set used = true, used_at = now() where id = v_invite.id;
  return jsonb_build_object('applied', true, 'role', v_invite.role, 'campus', v_invite.campus);
end;
$$;
