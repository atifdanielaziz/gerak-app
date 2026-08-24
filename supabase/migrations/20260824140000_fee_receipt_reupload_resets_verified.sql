-- ============================================================
-- Fix: a re-uploaded monthly fee receipt never reaches admin review
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- ROOT CAUSE (traced against the live code, not assumed):
-- Profile.tsx's handleReceiptUpload only ever writes
-- `updateProfile({ feeReceiptUrl: url })` — it never touches
-- fee_receipt_verified. That column is one of the privileged ones
-- protect_privileged_profile_columns() already pins on every self-update,
-- so even if the client tried to send `feeReceiptVerified: false` it would
-- be silently reverted anyway.
--
-- ReceiptsTab.tsx's receiptStatus() reads exactly this combination:
--   fee_receipt_verified && fee_receipt_expiry <= now()  -> 'expired'
--   fee_receipt_verified                                 -> 'verified'
--   otherwise                                            -> 'pending'
-- and the Approve/Reject buttons only render for 'pending' rows with a
-- receipt URL.
--
-- CONSEQUENCE: a driver whose PREVIOUS receipt was approved and has since
-- expired uploads a new one for the current month. fee_receipt_url changes,
-- but fee_receipt_verified (still true, from the old approval) and
-- fee_receipt_expiry (still the old, past date) don't. receiptStatus()
-- keeps classifying the row as 'expired', so the Approve/Reject buttons
-- never appear — admin has no way to act on a real, uploaded receipt, and
-- the driver's account stays inactive indefinitely. Verified live: this is
-- exactly the state shown in the admin Receipts screenshot (Expired rows
-- with a real Receipt link but no Actions).
--
-- FIX: extend the same self-service trigger — when a self-update actually
-- changes fee_receipt_url, force fee_receipt_verified back to false and
-- clear any stale rejection reason, so the row falls back into 'pending'
-- and becomes reviewable again. Placed in the same self-service body as
-- the existing docs_status auto-transition, after the privileged-column
-- pin above it (so it overrides that pin specifically for this case).
-- Admin/superadmin calls (approve_driver_receipt / reject_driver_receipt)
-- are untouched — they return at the top of the function before reaching
-- this, and already set fee_receipt_verified explicitly themselves.

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

  if old.gender is not null and new.gender is distinct from old.gender then
    new.gender := old.gender;
  end if;

  -- A genuinely new receipt upload (url actually changed) always needs a
  -- fresh manual review, regardless of what the previous review left
  -- behind — overrides the pin two lines above, on purpose, only for this
  -- one case.
  if new.fee_receipt_url is distinct from old.fee_receipt_url then
    new.fee_receipt_verified      := false;
    new.fee_receipt_reject_reason := '';
  end if;

  return new;
end;
$function$;
