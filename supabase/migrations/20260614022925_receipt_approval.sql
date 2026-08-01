-- ============================================================
-- Migration: Admin approve/reject driver receipts
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- RPC: superadmin/admin approves a pending receipt
create or replace function public.approve_driver_receipt(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_expiry      date;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Insufficient permissions');
  end if;

  -- Expiry = 1st day of next month (driver active for the rest of current month)
  v_expiry := (date_trunc('month', now()) + interval '1 month')::date;

  update public.profiles set
    fee_receipt_verified      = true,
    fee_receipt_expiry        = v_expiry,
    fee_receipt_amount        = 'RM25.00',
    fee_receipt_date          = to_char(now(), 'YYYY-MM-DD'),
    fee_receipt_reject_reason = ''
  where id = p_user_id;

  return json_build_object('success', true, 'expiry', v_expiry);
end;
$$;
grant execute on function public.approve_driver_receipt(uuid) to authenticated;

-- RPC: superadmin/admin rejects a receipt with a reason
create or replace function public.reject_driver_receipt(p_user_id uuid, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Insufficient permissions');
  end if;

  update public.profiles set
    fee_receipt_verified      = false,
    fee_receipt_reject_reason = p_reason,
    fee_receipt_expiry        = null
  where id = p_user_id;

  return json_build_object('success', true);
end;
$$;
grant execute on function public.reject_driver_receipt(uuid, text) to authenticated;
