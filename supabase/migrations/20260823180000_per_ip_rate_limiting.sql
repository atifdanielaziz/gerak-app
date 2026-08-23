-- Drop the temporary diagnostic function used to verify (against the live
-- request pipeline, not guessed) whether a caller's real IP is actually
-- available inside a SQL function here. It is: PostgREST sets
-- request.headers as a per-request GUC before executing the function body,
-- independent of Postgres connection pooling underneath — confirmed via
-- cf-connecting-ip/x-forwarded-for/sb-forwarded-for all present and
-- correct on a real call. check_jubah_rate_limit()'s original comment
-- ("a per-IP throttle isn't reliably possible here since anon RPC calls
-- go through Supabase's pooler, which hides the real caller IP") was
-- mistaken — likely conflating the connection pooler with the HTTP
-- request layer, which are independent.
drop function if exists public.diag_request_headers();

-- ── check_jubah_rate_limit: per-IP instead of global ────────────────────────
-- A single global counter meant one scraper consumed the shared budget for
-- everyone, and made the effective per-attacker limit far higher than
-- intended once the ceiling was raised for legitimate shared-connection
-- traffic (campus wifi/NAT). Per-IP keeps the limit meaningful per caller
-- without punishing everyone else sharing a network.

alter table public.jubah_tracking_attempts add column if not exists client_ip text;
create index if not exists idx_jubah_tracking_attempts_ip on public.jubah_tracking_attempts (client_ip, attempted_at);

create or replace function public.check_jubah_rate_limit()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ip             text;
  v_ip_count       integer;
  v_global_count   integer;
begin
  v_ip := coalesce(
    current_setting('request.headers', true)::json->>'cf-connecting-ip',
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    'unknown'
  );

  delete from public.jubah_tracking_attempts where attempted_at < now() - interval '1 minute';

  select count(*) into v_ip_count
  from public.jubah_tracking_attempts
  where client_ip = v_ip;

  if v_ip_count >= 20 then
    raise exception 'Too many requests right now. Please wait a minute and try again.';
  end if;

  -- Secondary, much higher ceiling — resource protection against a
  -- coordinated multi-IP flood, not the primary per-caller throttle.
  select count(*) into v_global_count from public.jubah_tracking_attempts;
  if v_global_count >= 500 then
    raise exception 'Too many requests right now. Please wait a minute and try again.';
  end if;

  insert into public.jubah_tracking_attempts (client_ip) values (v_ip);
end;
$$;

-- ── check_driver_invite: had no rate limiting at all ────────────────────────
-- Anon-callable, returns whether an email has a live invite (plus campus/
-- university/role) — enumerable one email at a time with no throttle.
-- Same per-IP pattern as above, dedicated table since this is a different
-- feature domain from Jubah tracking.

create table if not exists public.invite_check_attempts (
  id uuid default gen_random_uuid() primary key,
  client_ip text,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_invite_check_attempts_ip on public.invite_check_attempts (client_ip, attempted_at);

create or replace function public.check_invite_rate_limit()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ip       text;
  v_ip_count integer;
begin
  v_ip := coalesce(
    current_setting('request.headers', true)::json->>'cf-connecting-ip',
    current_setting('request.headers', true)::json->>'x-forwarded-for',
    'unknown'
  );

  delete from public.invite_check_attempts where attempted_at < now() - interval '1 minute';

  select count(*) into v_ip_count
  from public.invite_check_attempts
  where client_ip = v_ip;

  if v_ip_count >= 20 then
    raise exception 'Too many requests right now. Please wait a minute and try again.';
  end if;

  insert into public.invite_check_attempts (client_ip) values (v_ip);
end;
$$;

revoke all on table public.invite_check_attempts from anon, authenticated;
revoke all on function public.check_invite_rate_limit() from public;
grant execute on function public.check_invite_rate_limit() to anon, authenticated;

create or replace function public.check_driver_invite(p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.driver_invites;
begin
  perform public.check_invite_rate_limit();

  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(p_email) and not used;

  if v_invite.id is null then
    return json_build_object('is_driver', false);
  end if;

  return json_build_object(
    'is_driver',  true,
    'campus',     v_invite.campus,
    'university', v_invite.university,
    'role',       coalesce(v_invite.role, 'driver')
  );
end;
$$;
