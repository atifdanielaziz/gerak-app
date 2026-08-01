-- ============================================================
-- Bank account details for the Jubah manual-transfer payment flow
-- (replaces ToyyibPay — see plan "Revert Jubah payment from
-- ToyyibPay back to manual proof-upload + reference matching")
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Same app_settings table/RLS already used for jubah_active /
-- receipt_gate_active — public read, admin/superadmin write, no new
-- policy needed.

insert into public.app_settings (key, value) values
  ('jubah_bank_name', 'PLACEHOLDER — set the real bank name before going live'),
  ('jubah_bank_account_number', 'PLACEHOLDER'),
  ('jubah_bank_account_holder', 'PLACEHOLDER')
on conflict (key) do nothing;
