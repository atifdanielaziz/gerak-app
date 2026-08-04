-- ============================================================
-- In-campus / out-of-campus presence status for staff
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Purely informational, distinct from profiles.status (active/suspended)
-- and unrelated to actually being available for rides — this just lets
-- admin see who's physically around campus vs away for a long stretch
-- (semester break, holiday) while their account otherwise stays active.
--
-- Self-service (driver toggles their own) is the primary path — no RPC
-- needed for that, a plain client .update() on their own row already
-- works, since new columns are unprotected/self-editable by default (see
-- protect_privileged_profile_columns's comment in 20260804103000_
-- security_audit_fixes.sql). Admin/superadmin override needs its own RPC
-- since there's no existing direct-update path for one user's row by
-- another (every admin write on someone else's profile already goes
-- through a SECURITY DEFINER RPC, never raw REST).

alter table public.profiles
  add column if not exists campus_status text not null default 'in_campus';

do $$
begin
  alter table public.profiles
    add constraint profiles_campus_status_check
    check (campus_status in ('in_campus', 'out_campus'));
exception when duplicate_object then null;
end $$;

create or replace function public.set_staff_campus_status(p_user_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.get_my_role() not in ('admin', 'superadmin') then
    return jsonb_build_object('success', false, 'error', 'Admins only.');
  end if;
  if p_status not in ('in_campus', 'out_campus') then
    return jsonb_build_object('success', false, 'error', 'Invalid status.');
  end if;

  update public.profiles set campus_status = p_status where id = p_user_id;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.set_staff_campus_status(uuid, text) to authenticated;
