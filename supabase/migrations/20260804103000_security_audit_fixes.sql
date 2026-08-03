-- ============================================================
-- Remaining security-audit fixes (2026-08-04)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1) jubah_tracking_attempts had no RLS enabled at all, and no grants were
--    ever revoked — any anon/authenticated caller could INSERT or DELETE
--    directly via PostgREST, resetting or padding the shared rate-limit
--    counter that check_jubah_rate_limit() relies on, defeating the
--    anti-scraping throttle on every guest-facing Jubah lookup RPC
--    (track_jubah_booking, get_jubah_receipt, get_jubah_booking_live_
--    status). check_jubah_rate_limit() is SECURITY DEFINER and keeps
--    working unaffected — it bypasses RLS/grants the same way every other
--    SECURITY DEFINER function in this app already does.
alter table public.jubah_tracking_attempts enable row level security;
revoke all on public.jubah_tracking_attempts from authenticated, anon;

-- 2) fee_receipt_auto_verified was added after protect_privileged_profile_
--    columns already existed and was never added to its pinned-column
--    list, so a user could clear this "AI-only approval, needs human
--    audit" flag on their own row via a direct profile update, defeating
--    its purpose (see 20260726084942_security_fix_medium.sql's own
--    comment: a human reviewing it is "strictly more trustworthy" than
--    the AI call, which is exactly the flag this lets a user erase).
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

  return new;
end;
$function$;
