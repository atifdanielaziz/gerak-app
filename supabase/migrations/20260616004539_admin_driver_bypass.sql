-- ============================================================
-- Migration: admin-to-driver bypass
-- When a superadmin changes someone's role TO driver, auto-activate
-- them (fee_receipt_verified = true, far-future expiry) so they can
-- accept jobs immediately — but ONLY if they are not already suspended
-- (status = 'inactive').  Suspension always wins.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create or replace function public.toggle_user_role(
  p_target_id uuid,
  p_new_role  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role    text;
  v_current_status text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role <> 'superadmin' then
    raise exception 'Only superadmin can change roles';
  end if;
  if p_new_role not in ('driver', 'admin') then
    raise exception 'Invalid role';
  end if;

  select status into v_current_status from public.profiles where id = p_target_id;

  update public.profiles
    set role      = p_new_role,
        can_drive = case when p_new_role = 'admin'  then true else can_drive end,
        can_rent  = case when p_new_role = 'admin'  then true else can_rent  end,

        -- Auto-bypass receipt gate for admin → driver, but only if not suspended
        fee_receipt_verified = case
          when p_new_role = 'driver' and v_current_status = 'active' then true
          else fee_receipt_verified
        end,
        fee_receipt_expiry = case
          when p_new_role = 'driver' and v_current_status = 'active' then '2099-12-31'::date
          else fee_receipt_expiry
        end

    where id = p_target_id;
end;
$$;
grant execute on function public.toggle_user_role(uuid, text) to authenticated;
