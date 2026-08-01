-- ============================================================
-- Security fix: M-1 (rate limiting), M-2 (AI-verification audit
-- trail), L-3 (public jubah_rider_assignments)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ── M-1 ──────────────────────────────────────────────────────────────────
-- cancel_jubah_booking_customer, submit_jubah_balance, and
-- toyyibpay-create-bill all use the same reference+hp_number ownership
-- pairing as get_jubah_receipt, but only get_jubah_receipt rate-limits.
-- Extracted the shared block into its own function so all four paths
-- (including get_jubah_receipt, left as-is since it already works and
-- isn't broken) draw from one place going forward.

create or replace function public.check_jubah_rate_limit()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_recent_count integer;
begin
  delete from public.jubah_tracking_attempts where attempted_at < now() - interval '1 minute';
  select count(*) into v_recent_count from public.jubah_tracking_attempts;
  if v_recent_count >= 80 then
    raise exception 'Too many requests right now. Please wait a minute and try again.';
  end if;
  insert into public.jubah_tracking_attempts default values;
end;
$$;

create or replace function public.cancel_jubah_booking_customer(p_reference text, p_hp_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  perform public.check_jubah_rate_limit();

  select id into v_id
  from public.jubah_bookings
  where reference = p_reference
    and hp_number = p_hp_number
    and status = 'ordered'
  limit 1;

  if v_id is null then
    return jsonb_build_object('success', false, 'error', 'This booking can no longer be cancelled here — please contact admin.');
  end if;

  update public.jubah_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = 'customer'
   where id = v_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.submit_jubah_balance(p_reference text, p_hp_number text, p_balance_proof_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  perform public.check_jubah_rate_limit();

  select id into v_id
  from   public.jubah_bookings
  where  reference    = p_reference
    and  hp_number    = p_hp_number
    and  payment_mode = 'deposit'
    and  balance_paid = false
  limit 1;

  if v_id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found or already paid.');
  end if;

  update public.jubah_bookings
     set balance_proof_url    = p_balance_proof_url,
         balance_submitted_at = now()
   where id = v_id;

  return jsonb_build_object('success', true);
end;
$$;

-- toyyibpay-create-bill (edge function) calls this same RPC via its
-- service-role client before doing anything else — see that file's diff.
grant execute on function public.check_jubah_rate_limit() to anon, authenticated, service_role;

-- ── M-2 ──────────────────────────────────────────────────────────────────
-- verify-receipt auto-approves purely on what an AI vision model reads off
-- an uploaded image, with no independent confirmation and no way to tell
-- an auto-approved receipt apart from one a human admin actually reviewed.
-- Real fix (a real payment gateway, like Jubah already has) is a bigger
-- project than this pass — this adds the compensating control instead:
-- auto-approved receipts are now flagged and visible to admins for spot
-- audits, distinct from ones a human already looked at.

alter table public.profiles
  add column if not exists fee_receipt_auto_verified boolean not null default false;

-- A human reviewing it (approve_driver_receipt) is strictly more trustworthy
-- than the AI call that ran earlier — clear the flag on manual approval.
create or replace function public.approve_driver_receipt(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller_role text;
  v_expiry      date;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Insufficient permissions');
  end if;

  v_expiry := (date_trunc('month', now()) + interval '1 month')::date;

  update public.profiles set
    fee_receipt_verified       = true,
    fee_receipt_auto_verified  = false,
    fee_receipt_expiry         = v_expiry,
    fee_receipt_amount         = 'RM25.00',
    fee_receipt_date           = to_char(now(), 'YYYY-MM-DD'),
    fee_receipt_reject_reason  = ''
  where id = p_user_id;

  return json_build_object('success', true, 'expiry', v_expiry);
end;
$$;

-- ── L-3 ──────────────────────────────────────────────────────────────────
-- Drop point / method / campus / rider ID for every Jubah rider assignment,
-- readable by literally anyone. No customer-facing flow depends on this —
-- the actual customer-facing rider directory goes through
-- get_active_jubah_riders / get_jubah_riders_directory_v2, both
-- SECURITY DEFINER functions that don't touch this table's RLS at all.
-- Only authenticated (admin) UI reads the raw table directly.

drop policy if exists "Public read jubah_rider_assignments" on public.jubah_rider_assignments;

create policy "authenticated_read_jubah_rider_assignments"
  on public.jubah_rider_assignments
  for select
  to authenticated
  using (true);
