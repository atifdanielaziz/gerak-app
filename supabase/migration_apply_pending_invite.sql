-- ============================================================
-- Apply pending invites to existing accounts on login
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- handle_new_user() only ever applies a driver_invites row at the moment
-- a brand-new auth.users row is INSERTed — i.e. only at signup. If an
-- admin invites an email that already has an account (e.g. an existing
-- 'customer'), that trigger structurally never fires for it, so the
-- invite just sits unused forever with no path to ever apply — even
-- though the invite email itself promises access "the moment you
-- register", which is false for someone who already has an account.
--
-- This RPC mirrors handle_new_user()'s invite-matching and gerak_id
-- assignment logic exactly, but UPDATEs the caller's existing profile
-- instead of INSERTing a new one. Called from the client right before
-- loadProfile() on both login and session-restore (see AppContext.tsx).
--
-- Deliberately conservative scope: only applies when the caller's
-- CURRENT role is 'customer'. Never touches an existing driver/rider/
-- admin/superadmin account — promoting/reassigning someone who already
-- has elevated access stays a manual admin action, not something a
-- login-time check should ever silently do.
create or replace function public.apply_pending_invite()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid          uuid := auth.uid();
  v_email        text;
  v_current_role text;
  v_invite       public.driver_invites;
  v_gerak_id     text;
begin
  if v_uid is null then
    return jsonb_build_object('applied', false);
  end if;

  select role into v_current_role from public.profiles where id = v_uid;
  if v_current_role is distinct from 'customer' then
    return jsonb_build_object('applied', false);
  end if;

  select email into v_email from auth.users where id = v_uid;
  if v_email is null then
    return jsonb_build_object('applied', false);
  end if;

  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(v_email) and not used;

  if v_invite.id is null then
    return jsonb_build_object('applied', false);
  end if;

  -- Same inline nextval() logic as handle_new_user(), same six sequences.
  if v_invite.role = 'rider' then
    if v_invite.campus = 'Pekan' then
      v_gerak_id := 'GRP' || lpad(nextval('gerak_id_grp_seq')::text, 4, '0');
    else
      v_gerak_id := 'GRG' || lpad(nextval('gerak_id_grg_seq')::text, 4, '0');
    end if;
  elsif v_invite.role = 'driver' then
    if v_invite.campus = 'Pekan' then
      v_gerak_id := 'GDP' || lpad(nextval('gerak_id_gdp_seq')::text, 4, '0');
    else
      v_gerak_id := 'GDG' || lpad(nextval('gerak_id_gdg_seq')::text, 4, '0');
    end if;
  else
    if v_invite.campus = 'Pekan' then
      v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
    else
      v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
    end if;
  end if;

  -- Transaction-local only (set_config's third arg = true) — cleared
  -- automatically once this call's transaction ends, so it can never
  -- leak into an unrelated later query on a pooled/reused connection.
  perform set_config('app.applying_invite', 'true', true);

  update public.profiles set
    role          = coalesce(v_invite.role, 'driver'),
    campus        = v_invite.campus,
    gerak_id      = v_gerak_id,
    can_drive     = coalesce(v_invite.can_drive, false),
    can_rent      = coalesce(v_invite.can_rent, false),
    can_daily     = coalesce(v_invite.can_daily, false),
    can_robe      = coalesce(v_invite.can_robe, false),
    can_transport = coalesce(v_invite.can_transport, false)
  where id = v_uid;

  update public.driver_invites
    set used = true, used_at = now()
    where id = v_invite.id;

  return jsonb_build_object('applied', true, 'role', v_invite.role, 'campus', v_invite.campus);
end;
$$;

grant execute on function public.apply_pending_invite() to authenticated;

-- protect_privileged_profile_columns (a BEFORE UPDATE trigger on profiles)
-- silently reverts role/campus/gerak_id/capability columns back to their
-- old values for any caller whose OWN role isn't admin/superadmin — it
-- exists to stop a customer self-escalating via a raw client .update(),
-- and it doesn't care that this specific UPDATE is coming from inside a
-- SECURITY DEFINER function; get_my_role() still resolves to the real
-- caller (a customer). Confirmed live: apply_pending_invite() reported
-- {"applied": true} while the actual profile row was left completely
-- unchanged by this trigger. Add a narrow, transaction-scoped bypass
-- that only apply_pending_invite() itself sets, right before its own
-- UPDATE — a real client .update() call can never set this, since
-- set_config() isn't reachable from PostgREST, so the original
-- protection against a customer editing their own row is unaffected.
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.get_my_role() in ('admin', 'superadmin') then
    return new;
  end if;

  if current_setting('app.applying_invite', true) = 'true' then
    return new;
  end if;

  new.role                      := old.role;
  new.status                    := old.status;
  new.campus                    := old.campus;
  new.can_drive                 := old.can_drive;
  new.can_rent                  := old.can_rent;
  new.can_daily                 := old.can_daily;
  new.can_robe                  := old.can_robe;
  new.can_transport              := old.can_transport;
  new.receipt_gate_exempt       := old.receipt_gate_exempt;
  new.docs_reject_reason        := old.docs_reject_reason;
  new.fee_receipt_verified      := old.fee_receipt_verified;
  new.fee_receipt_amount        := old.fee_receipt_amount;
  new.fee_receipt_date          := old.fee_receipt_date;
  new.fee_receipt_expiry        := old.fee_receipt_expiry;
  new.fee_receipt_reject_reason := old.fee_receipt_reject_reason;
  new.gerak_id                  := old.gerak_id;
  new.points                    := old.points;
  new.jubah_method               := old.jubah_method;
  new.jubah_drop_point            := old.jubah_drop_point;

  if new.docs_status is distinct from old.docs_status and new.docs_status is distinct from 'pending' then
    new.docs_status := old.docs_status;
  end if;

  return new;
end;
$function$;
