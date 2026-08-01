-- ============================================================
-- Superadmin-only RPC to set the Jubah payment bank details
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Same pattern as set_jubah_rider_commission_rate: app_settings' own
-- UPDATE policy allows admin OR superadmin, but bank account details are
-- more sensitive than most settings here (a mistaken or malicious edit
-- silently redirects real customer payments) — restricted specifically to
-- superadmin, enforced server-side, not just hidden in the UI.

create or replace function public.set_jubah_bank_details(
  p_bank_name text,
  p_account_number text,
  p_account_holder text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;

  update public.app_settings set value = p_bank_name       where key = 'jubah_bank_name';
  update public.app_settings set value = p_account_number  where key = 'jubah_bank_account_number';
  update public.app_settings set value = p_account_holder  where key = 'jubah_bank_account_holder';

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.set_jubah_bank_details(text, text, text) from public, anon;
