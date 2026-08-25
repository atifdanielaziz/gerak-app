-- Two audit-trail gaps found in the full skills re-sweep:
--
-- 1. profiles' log_activity trigger allowlist covers role/status/
--    capabilities/campus/docs_status but not fee_receipt_verified,
--    fee_receipt_reject_reason, or docs_reject_reason — all three are
--    written by admin-only RPCs (approve_driver_receipt,
--    reject_driver_receipt, decideDocuments's underlying RPC) but were
--    invisible to the audit log. Who approved/rejected a receipt or a
--    document, and why, was untraceable.
--
-- 2. ride_orders only logs on DELETE — an admin changing a live order's
--    status or reassigning its driver went completely unlogged, only the
--    eventual deletion was ever recorded.
drop trigger if exists log_activity on public.profiles;
create trigger log_activity
  after update on public.profiles
  for each row execute function public.log_admin_activity(
    'role,status,can_drive,can_rent,can_transport,can_daily,can_robe,receipt_gate_exempt,campus,docs_status,docs_reject_reason,fee_receipt_verified,fee_receipt_reject_reason'
  );

drop trigger if exists log_activity on public.ride_orders;
create trigger log_activity
  after update or delete on public.ride_orders
  for each row execute function public.log_admin_activity('status,driver_id');
