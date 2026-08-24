-- ============================================================
-- Rate-limit email_is_registered — it was the one guest-facing lookup
-- RPC that never got a throttle
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Anon-callable, deliberately accepts a user-enumeration tradeoff (see
-- the RPC's own original comment) — but "the client's own 600ms debounce"
-- is not real throttling, since it's trivially bypassed by calling the
-- RPC directly with the anon key. check_driver_invite already solved the
-- identical "guest-facing lookup RPC" problem with check_invite_rate_limit()
-- (per-IP, 20/minute, 20260823180000) — reused as-is here rather than
-- standing up a second table for the same shape of problem.
--
-- Safe by construction: AppContext.tsx's checkEmailRegistered already
-- fails open on any RPC error (`if (error) return false`), so a raised
-- rate-limit exception just reads as "not registered" under heavy
-- throttle — never a crash, never blocks a real sign-in attempt.

create or replace function public.email_is_registered(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_invite_rate_limit();

  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  return exists (select 1 from auth.users where lower(email) = lower(p_email));
end;
$$;
