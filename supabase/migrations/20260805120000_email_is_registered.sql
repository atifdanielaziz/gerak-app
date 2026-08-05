-- ============================================================
-- email_is_registered: lets Login.tsx show "this email isn't
-- registered" as the user types, before they even try to sign in.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Deliberately checked and accepted user-enumeration tradeoff (this
-- reveals whether an arbitrary email has a Gerak account) — reasonable
-- for a closed campus population. Format guard below plus the client's
-- own 600ms debounce (same pattern as check_driver_invite) are the only
-- throttling; no rate-limit table, matching every other public-facing
-- RPC in this project.
create or replace function public.email_is_registered(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  return exists (select 1 from auth.users where lower(email) = lower(p_email));
end;
$$;
grant execute on function public.email_is_registered(text) to anon, authenticated;
