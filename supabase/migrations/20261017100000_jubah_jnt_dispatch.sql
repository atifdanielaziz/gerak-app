-- ============================================================
-- Migration: J&T dispatch page for Jubah postage
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- J&T counter staff copy each postage parcel's details into J&T's system
-- from a page on their own laptop. No Gerak account: superadmin issues a
-- secret link (token, 3 days by default, revocable). Only the hash of the
-- token is stored. The page shows postage parcels of that university with
-- the fields J&T needs, plus the runner's sender details, and lets staff
-- mark copied fields / done and enter the J&T tracking number, which the
-- customer then sees in Track My Order.

-- ── 1. Permanent order number ─────────────────────────────────────────
-- The admin "No" column was computed per page load from created_at order,
-- so it shifted when a booking was deleted (1XEG51 went 84 -> 83). J&T
-- uses it as the order number, so freeze it. Backfilled from the same
-- ordering the directory uses today; new bookings take max + 1.

alter table public.jubah_bookings add column if not exists order_no integer;

with x as (
  select id, row_number() over (partition by university_key order by created_at, id::text) as n
  from public.jubah_bookings
)
update public.jubah_bookings b set order_no = x.n
from x where x.id = b.id and b.order_no is null;

create unique index if not exists jubah_bookings_university_order_no
  on public.jubah_bookings (university_key, order_no);

create or replace function public.jubah_booking_assign_order_no()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.order_no is null then
    perform pg_advisory_xact_lock(hashtext('jubah_order_no:' || coalesce(new.university_key, '')));
    select coalesce(max(order_no), 0) + 1 into new.order_no
    from public.jubah_bookings where university_key is not distinct from new.university_key;
  end if;
  return new;
end;
$$;

drop trigger if exists jubah_booking_assign_order_no on public.jubah_bookings;
create trigger jubah_booking_assign_order_no
  before insert on public.jubah_bookings
  for each row execute function public.jubah_booking_assign_order_no();

-- ── 2. Dispatch progress + tracking on the booking ─────────────────────
alter table public.jubah_bookings
  add column if not exists tracking_no text,
  add column if not exists dispatch_copied text[] not null default '{}',
  add column if not exists dispatch_done_at timestamptz;

-- ── 3. Sender details per runner ──────────────────────────────────────
create table if not exists public.jubah_dispatch_senders (
  rider_id   uuid primary key references public.profiles(id) on delete cascade,
  name       text not null,
  phone      text not null,
  address    text not null,
  postcode   text not null,
  city       text not null,
  state      text not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.jubah_dispatch_senders enable row level security;
-- No policies: read/write only through the RPCs below.

create or replace function public.get_jubah_dispatch_senders()
returns table (rider_id uuid, rider_name text, name text, phone text, address text, postcode text, city text, state text)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if coalesce(get_my_role(), '') not in ('admin', 'superadmin') then
    raise exception 'Unauthorised';
  end if;
  return query
  select r.id, r.name, s.name, s.phone, s.address, s.postcode, s.city, s.state
  from (select distinct p.id, p.name
          from public.jubah_rider_assignments a join public.profiles p on p.id = a.rider_id
         where a.method = 'postage' and a.is_active) r
  left join public.jubah_dispatch_senders s on s.rider_id = r.id
  order by r.name;
end;
$$;
revoke all on function public.get_jubah_dispatch_senders() from public, anon;
grant execute on function public.get_jubah_dispatch_senders() to authenticated;

create or replace function public.set_jubah_dispatch_sender(
  p_rider_id uuid, p_name text, p_phone text, p_address text, p_postcode text, p_city text, p_state text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if coalesce(get_my_role(), '') <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  if coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_phone), '') = '' or coalesce(btrim(p_address), '') = ''
     or coalesce(btrim(p_postcode), '') = '' or coalesce(btrim(p_city), '') = '' or coalesce(btrim(p_state), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Fill in every sender field.');
  end if;
  if btrim(p_postcode) !~ '^\d{5}$' then
    return jsonb_build_object('success', false, 'error', 'Postcode must be 5 digits.');
  end if;
  if length(p_name) > 100 or length(p_phone) > 20 or length(p_address) > 300 or length(p_city) > 60 or length(p_state) > 60 then
    return jsonb_build_object('success', false, 'error', 'One of the fields is too long.');
  end if;
  insert into public.jubah_dispatch_senders (rider_id, name, phone, address, postcode, city, state, updated_by, updated_at)
  values (p_rider_id, btrim(p_name), btrim(p_phone), btrim(p_address), btrim(p_postcode), btrim(p_city), btrim(p_state), auth.uid(), now())
  on conflict (rider_id) do update set
    name = excluded.name, phone = excluded.phone, address = excluded.address, postcode = excluded.postcode,
    city = excluded.city, state = excluded.state, updated_by = excluded.updated_by, updated_at = now();
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.set_jubah_dispatch_sender(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.set_jubah_dispatch_sender(uuid, text, text, text, text, text, text) to authenticated;

-- ── 4. Secret links for J&T staff ─────────────────────────────────────
create table if not exists public.jubah_dispatch_links (
  id             uuid primary key default gen_random_uuid(),
  token_hash     text not null unique,
  university_key text not null,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz
);
alter table public.jubah_dispatch_links enable row level security;
-- No policies: managed only through the RPCs below.

create or replace function public.jubah_dispatch_hash(p_token text)
returns text
language sql immutable
set search_path to 'public', 'extensions'
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); $$;
revoke all on function public.jubah_dispatch_hash(text) from public, anon, authenticated;

-- University of a live link, or NULL if the token is unknown, expired or revoked.
create or replace function public.jubah_dispatch_link_university(p_token text)
returns text
language sql stable security definer
set search_path to 'public'
as $$
  select l.university_key from public.jubah_dispatch_links l
  where l.token_hash = public.jubah_dispatch_hash(p_token)
    and l.revoked_at is null and l.expires_at > now();
$$;
revoke all on function public.jubah_dispatch_link_university(text) from public, anon, authenticated;

create or replace function public.create_jubah_dispatch_link(p_university text, p_days integer default 3)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_token text;
  v_row public.jubah_dispatch_links;
begin
  if coalesce(get_my_role(), '') <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  if p_days is null or p_days < 1 or p_days > 14 then
    return jsonb_build_object('success', false, 'error', 'Choose between 1 and 14 days.');
  end if;
  if not exists (select 1 from public.jubah_bookings where university_key = p_university) then
    return jsonb_build_object('success', false, 'error', 'No bookings for this university.');
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.jubah_dispatch_links (token_hash, university_key, created_by, expires_at)
  values (public.jubah_dispatch_hash(v_token), p_university, auth.uid(), now() + make_interval(days => p_days))
  returning * into v_row;
  return jsonb_build_object('success', true, 'id', v_row.id, 'token', v_token, 'expires_at', v_row.expires_at);
end;
$$;
revoke all on function public.create_jubah_dispatch_link(text, integer) from public, anon;
grant execute on function public.create_jubah_dispatch_link(text, integer) to authenticated;

create or replace function public.list_jubah_dispatch_links(p_university text)
returns table (id uuid, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, active boolean)
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if coalesce(get_my_role(), '') <> 'superadmin' then
    raise exception 'Unauthorised';
  end if;
  return query
  select l.id, l.created_at, l.expires_at, l.revoked_at, (l.revoked_at is null and l.expires_at > now())
  from public.jubah_dispatch_links l
  where l.university_key = p_university
  order by l.created_at desc
  limit 10;
end;
$$;
revoke all on function public.list_jubah_dispatch_links(text) from public, anon;
grant execute on function public.list_jubah_dispatch_links(text) to authenticated;

create or replace function public.revoke_jubah_dispatch_link(p_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if coalesce(get_my_role(), '') <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  update public.jubah_dispatch_links set revoked_at = now() where id = p_id and revoked_at is null;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.revoke_jubah_dispatch_link(uuid) from public, anon;
grant execute on function public.revoke_jubah_dispatch_link(uuid) to authenticated;

-- ── 5. What the J&T page reads and writes (token-gated, anon) ─────────
create or replace function public.jubah_is_postage(b public.jubah_bookings)
returns boolean
language sql immutable
as $$ select b.payment_mode = 'postage' or (b.payment_mode = 'deposit' and b.delivery_address is not null); $$;

create or replace function public.get_jubah_dispatch(p_token text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_uni text := public.jubah_dispatch_link_university(p_token);
  v_expires timestamptz;
begin
  if v_uni is null then
    return jsonb_build_object('success', false, 'error', 'This link has expired or is no longer valid.');
  end if;
  select expires_at into v_expires from public.jubah_dispatch_links where token_hash = public.jubah_dispatch_hash(p_token);
  return jsonb_build_object(
    'success', true,
    'university_key', v_uni,
    'expires_at', v_expires,
    'parcels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'order_no', b.order_no, 'reference', b.reference,
        'name', b.full_name, 'phone', b.hp_number, 'email', b.email, 'address', b.delivery_address,
        'copied', b.dispatch_copied, 'done', b.dispatch_done_at is not null, 'tracking_no', b.tracking_no,
        'sender', case when s.rider_id is null then null else jsonb_build_object(
          'name', s.name, 'phone', s.phone, 'address', s.address, 'postcode', s.postcode, 'city', s.city, 'state', s.state) end,
        'rider_name', b.rider_name
      ) order by b.order_no)
      from public.jubah_bookings b
      left join public.jubah_dispatch_senders s on s.rider_id = b.rider_id
      where b.university_key = v_uni and b.status <> 'cancelled' and public.jubah_is_postage(b)
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_jubah_dispatch(text) from public;
grant execute on function public.get_jubah_dispatch(text) to anon, authenticated;

-- Each argument left NULL means "no change".
create or replace function public.update_jubah_dispatch(
  p_token text, p_booking_id uuid, p_copied text[] default null, p_done boolean default null, p_tracking_no text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_uni text := public.jubah_dispatch_link_university(p_token);
  v_tracking text := nullif(upper(regexp_replace(coalesce(p_tracking_no, ''), '\s', '', 'g')), '');
begin
  if v_uni is null then
    return jsonb_build_object('success', false, 'error', 'This link has expired or is no longer valid.');
  end if;
  if p_copied is not null and (cardinality(p_copied) > 20
     or exists (select 1 from unnest(p_copied) f where f not in ('order_no', 'name', 'phone', 'email', 'address', 'postcode', 'city', 'state'))) then
    return jsonb_build_object('success', false, 'error', 'Invalid field.');
  end if;
  if p_tracking_no is not null and v_tracking is not null and v_tracking !~ '^[A-Z0-9]{6,30}$' then
    return jsonb_build_object('success', false, 'error', 'Tracking number should be 6–30 letters or digits.');
  end if;
  update public.jubah_bookings b set
    dispatch_copied  = coalesce(p_copied, b.dispatch_copied),
    dispatch_done_at = case when p_done is null then b.dispatch_done_at when p_done then coalesce(b.dispatch_done_at, now()) else null end,
    tracking_no      = case when p_tracking_no is null then b.tracking_no else v_tracking end
  where b.id = p_booking_id and b.university_key = v_uni and b.status <> 'cancelled' and public.jubah_is_postage(b);
  if not found then
    return jsonb_build_object('success', false, 'error', 'Parcel not found.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.update_jubah_dispatch(text, uuid, text[], boolean, text) from public;
grant execute on function public.update_jubah_dispatch(text, uuid, text[], boolean, text) to anon, authenticated;

-- ── 6. Tracking number in Track My Order ──────────────────────────────
drop function if exists public.track_jubah_booking(text, text);
create function public.track_jubah_booking(p_reference text, p_ic_number text)
returns table(id uuid, reference text, full_name text, hp_number text, campus text, faculty text, remark text, status text, payment_mode text, rider_id uuid, rider_name text, rider_phone text, balance_due numeric, balance_paid boolean, balance_proof_url text, rider_changed_at timestamp with time zone, payee_rider_id uuid, tracking_no text)
language plpgsql security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

  if coalesce(btrim(p_reference), '') = '' and coalesce(btrim(p_ic_number), '') = '' then
    raise exception 'Reference number or IC number is required';
  end if;

  return query
  select jb.id, jb.reference, jb.full_name, jb.hp_number, jb.campus, jb.faculty, jb.remark,
         jb.status, jb.payment_mode, jb.rider_id, jb.rider_name, p.phone as rider_phone,
         jb.balance_due, jb.balance_paid, jb.balance_proof_url, jb.rider_changed_at, jb.payee_rider_id, jb.tracking_no
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where (coalesce(btrim(p_reference), '') = '' or jb.reference = p_reference)
    and (coalesce(btrim(p_ic_number), '') = '' or replace(jb.ic_number, '-', '') = replace(p_ic_number, '-', ''))
  order by jb.created_at desc;
end;
$$;
grant execute on function public.track_jubah_booking(text, text) to anon, authenticated;
