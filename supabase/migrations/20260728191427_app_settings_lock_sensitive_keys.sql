-- ============================================================
-- Restrict app_settings direct UPDATE to only the keys admin is
-- actually meant to touch; superadmin-only keys stay RPC-only
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- CONFIRMED LIVE, not assumed: "settings_update" only checked
-- get_my_role() in ('admin','superadmin') — a single table-wide role
-- check with no awareness of which row (key) is being touched. But
-- set_jubah_bank_details and the rider-commission-rate RPC both exist
-- specifically to restrict jubah_bank_name / jubah_bank_account_number /
-- jubah_bank_account_holder / jubah_rider_commission_percent_pickup /
-- jubah_rider_commission_percent_postage to superadmin only — a regular
-- admin was able to bypass that restriction completely by calling
-- PostgREST's update endpoint directly:
--   supabase.from('app_settings').update({value: 'attacker-account-no'})
--     .eq('key','jubah_bank_account_number')
-- which would silently redirect every future customer payment, without
-- ever touching the superadmin-checked RPC at all.
--
-- Verified via grep before writing this fix: the only two legitimate
-- direct .update() calls on this table in the whole app are
-- AdminHome.tsx's jubah_active toggle and ReceiptsTab.tsx's
-- receipt_gate_active toggle — both intentionally admin-level, not
-- superadmin-only. Everything else (bank details, commission rate) is
-- only ever written through its dedicated RPC from the client.
--
-- Allowlisting the two admin-safe keys (rather than blocklisting the
-- sensitive ones) so a new sensitive setting added later defaults to
-- superadmin-only unless someone deliberately opts it into the admin
-- allowlist — fails secure, not fails open.

drop policy if exists "settings_update" on public.app_settings;

create policy "settings_update" on public.app_settings
  for update
  to authenticated
  using (
    get_my_role() = 'superadmin'
    or (get_my_role() = 'admin' and key in ('jubah_active', 'receipt_gate_active'))
  )
  with check (
    get_my_role() = 'superadmin'
    or (get_my_role() = 'admin' and key in ('jubah_active', 'receipt_gate_active'))
  );
