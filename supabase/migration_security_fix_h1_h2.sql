-- ============================================================
-- Security fix: H-1 (unauthenticated set_driver_campus RPC) +
-- H-2 (campus not protected by the self-update guard trigger)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Both confirmed via code + grant inspection (not executed against real
-- data). Only caller of set_driver_campus is UsersTab.tsx, admin-only UI —
-- adding the role check server-side matches what's already enforced
-- client-side and doesn't change legitimate behavior.

-- ── H-1 ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER with no auth.uid()/role check in the body, and EXECUTE
-- was granted to anon — anyone, unauthenticated, could reassign any user's
-- campus. Same signature (uuid, text) -> void, so CREATE OR REPLACE is
-- safe here (no DROP-first needed — that's only required when the
-- parameter list or return type changes).

create or replace function public.set_driver_campus(p_user_id uuid, p_campus text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if get_my_role() not in ('admin', 'superadmin') then
    raise exception 'Not authorised';
  end if;

  update public.profiles
  set campus = p_campus
  where id = p_user_id;
end;
$$;

revoke execute on function public.set_driver_campus(uuid, text) from public, anon;

-- ── H-2 ──────────────────────────────────────────────────────────────────
-- protect_privileged_profile_columns already reverts a non-admin's attempt
-- to change role/status/capabilities/etc back to its old value — campus
-- was missing from that list, so a driver could self-update their own
-- campus directly (independent of H-1's RPC path) and widen which ride
-- pool they see. Same pattern as every other protected column here.

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Admin/superadmin may change anything, same as today.
  if public.get_my_role() in ('admin', 'superadmin') then
    return new;
  end if;

  -- Everyone else (updating their own row) may not change these —
  -- silently keep them at their current value rather than rejecting the
  -- whole update, so a legitimate save of other fields still succeeds.
  new.role                      := old.role;
  new.status                    := old.status;
  new.campus                    := old.campus;
  new.can_drive                 := old.can_drive;
  new.can_rent                  := old.can_rent;
  new.can_daily                 := old.can_daily;
  new.can_robe                  := old.can_robe;
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

  -- docs_status: the only self-service transition allowed is to 'pending'
  -- (set by the app right after a document upload) — anything else
  -- (e.g. 'approved', 'rejected') gets reverted.
  if new.docs_status is distinct from old.docs_status and new.docs_status is distinct from 'pending' then
    new.docs_status := old.docs_status;
  end if;

  return new;
end;
$$;
