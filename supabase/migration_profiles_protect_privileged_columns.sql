-- ============================================================
-- Migration: Lock down privileged columns on self-updated profile rows
-- "Users can update own profile" (auth.uid() = id) only checked WHOSE row
-- is being changed, never WHICH columns — so any logged-in user could set
-- their own role to 'superadmin' (or unlock any other admin-only gate:
-- status, fee/document verification, driving/rental eligibility) directly
-- via the database API, completely bypassing every admin-gated RPC
-- already built to control these fields correctly.
--
-- This adds a trigger that lets admin/superadmin change anything (same as
-- today), but for a normal self-update, silently keeps privileged columns
-- pinned to their current value instead of rejecting the whole update —
-- so a legitimate save of other fields (e.g. editing your name) still
-- succeeds even if a stray/malicious field is included.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
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

drop trigger if exists protect_privileged_profile_columns on public.profiles;
create trigger protect_privileged_profile_columns
  before update on public.profiles
  for each row
  execute function public.protect_privileged_profile_columns();
