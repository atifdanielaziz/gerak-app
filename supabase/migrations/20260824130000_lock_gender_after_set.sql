-- ============================================================
-- Lock profiles.gender once it's been set — real enforcement, not just
-- disabling the Profile.tsx buttons
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Gerak Car's "prefer a female driver" toggle (20260824110000) is gated on
-- the customer's own profiles.gender, and accept_ride_order's enforcement
-- is gated on the driver's. Both were self-editable with no restriction —
-- a male customer could set gender to 'female' just to unlock the toggle,
-- or a male driver could do the same to accept a ride a female customer
-- specifically restricted to a female driver, defeating the entire point
-- of the feature. Locking after first set doesn't stop a false answer on
-- the very first pick, but it closes the flip-it-back-and-forth case and
-- makes it a deliberate one-time choice instead of a checkbox to game per
-- booking.
--
-- Full body copied from 20260804103000_security_audit_fixes.sql (the
-- current authoritative version) with one addition: gender is pinned to
-- its old value once already set, same shape as the existing docs_status
-- conditional just below it. Admin/superadmin still bypass entirely (top
-- of the function, unchanged) — support can still correct a genuine
-- mistake on request.

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
  new.fee_receipt_auto_verified := old.fee_receipt_auto_verified;
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

  -- First set (old.gender is null) still passes through untouched —
  -- everything after that is pinned back, regardless of what the caller
  -- tried to send.
  if old.gender is not null and new.gender is distinct from old.gender then
    new.gender := old.gender;
  end if;

  return new;
end;
$function$;
