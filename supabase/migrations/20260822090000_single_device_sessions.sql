-- Single-device login for ordinary Gerak users.
-- Admins, superadmins and Jubah riders intentionally remain multi-device.

create table if not exists public.user_active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  claimed_at timestamptz not null default now()
);

alter table public.user_active_sessions enable row level security;

-- No direct table policies: clients can only claim/check their own Auth
-- session through the narrowly scoped SECURITY DEFINER functions below.

create or replace function public.claim_single_device_session()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
  v_role text;
begin
  if v_user_id is null or nullif(v_session_id, '') is null then
    raise exception 'Authenticated session required';
  end if;

  select role into v_role from public.profiles where id = v_user_id;

  if coalesce(v_role, 'customer') in ('admin', 'superadmin', 'rider') then
    delete from public.user_active_sessions where user_id = v_user_id;
    return false;
  end if;

  insert into public.user_active_sessions (user_id, session_id, claimed_at)
  values (v_user_id, v_session_id, now())
  on conflict (user_id) do update
    set session_id = excluded.session_id,
        claimed_at = excluded.claimed_at;

  return true;
end;
$$;

create or replace function public.validate_single_device_session()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id text := auth.jwt() ->> 'session_id';
  v_role text;
  v_active_session_id text;
begin
  if v_user_id is null or nullif(v_session_id, '') is null then
    return false;
  end if;

  select role into v_role from public.profiles where id = v_user_id;

  if coalesce(v_role, 'customer') in ('admin', 'superadmin', 'rider') then
    return true;
  end if;

  -- Safely enrol sessions that already existed when this migration shipped.
  insert into public.user_active_sessions (user_id, session_id, claimed_at)
  values (v_user_id, v_session_id, now())
  on conflict (user_id) do nothing;

  select session_id into v_active_session_id
  from public.user_active_sessions
  where user_id = v_user_id;

  return v_active_session_id = v_session_id;
end;
$$;

revoke all on table public.user_active_sessions from anon, authenticated;
revoke all on function public.claim_single_device_session() from public;
revoke all on function public.validate_single_device_session() from public;
grant execute on function public.claim_single_device_session() to authenticated;
grant execute on function public.validate_single_device_session() to authenticated;

