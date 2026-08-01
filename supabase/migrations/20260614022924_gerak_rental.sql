-- ============================================================
-- Migration: Gerak Rental feature
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Capability flags on profiles
alter table public.profiles
  add column if not exists can_drive boolean not null default false,
  add column if not exists can_rent  boolean not null default false;

-- Existing drivers inherit can_drive
update public.profiles set can_drive = true where role = 'driver';

-- 2. Capability flags on driver_invites (for future invites)
alter table public.driver_invites
  add column if not exists can_drive boolean not null default true,
  add column if not exists can_rent  boolean not null default false;

-- 3. Rental vehicle info (one per owner, owner_id is PK)
create table if not exists public.rental_vehicles (
  owner_id     uuid primary key references public.profiles(id) on delete cascade,
  car_type     text          not null default '',
  plate_no     text          not null default '',
  color        text          not null default '',
  seats        int           not null default 5,
  price_hour   numeric(10,2) not null default 10.00,
  description  text          not null default '',
  updated_at   timestamptz   not null default now()
);

-- 4. Blocked slots (one row per date, int[] for specific blocked hours)
--    Empty array = full day blocked
create table if not exists public.rental_blocks (
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  date          date not null,
  blocked_hours int[] not null default '{}',
  primary key (owner_id, date)
);

-- 5. Rental bookings
create table if not exists public.rental_bookings (
  id           uuid          primary key default gen_random_uuid(),
  owner_id     uuid          not null references public.profiles(id) on delete cascade,
  customer_id  uuid          not null references public.profiles(id) on delete cascade,
  date         date          not null,
  start_hour   int           not null,
  duration     int           not null default 1,
  persons      int           not null default 1,
  total_price  numeric(10,2) not null,
  status       text          not null default 'pending',
  notes        text          not null default '',
  created_at   timestamptz   not null default now()
);

-- 6. RLS
alter table public.rental_vehicles enable row level security;
alter table public.rental_blocks   enable row level security;
alter table public.rental_bookings enable row level security;

-- Vehicles: anyone authenticated can read; only owner can write
create policy "read vehicles"        on public.rental_vehicles for select using (auth.uid() is not null);
create policy "owner write vehicle"  on public.rental_vehicles for all    using (auth.uid() = owner_id);

-- Blocks: anyone authenticated can read; only owner can write
create policy "read blocks"          on public.rental_blocks   for select using (auth.uid() is not null);
create policy "owner write blocks"   on public.rental_blocks   for all    using (auth.uid() = owner_id);

-- Bookings: only owner or customer can see; customer creates; owner updates status
create policy "participants read"    on public.rental_bookings for select using (auth.uid() = owner_id or auth.uid() = customer_id);
create policy "customer creates"     on public.rental_bookings for insert with check (auth.uid() = customer_id);
create policy "owner updates"        on public.rental_bookings for update using (auth.uid() = owner_id);

-- Allow customers to read basic info of rental owners
create policy "read rental owner profiles" on public.profiles
  for select using (can_rent = true);

-- 7. Admin RPC: set driver capabilities
create or replace function public.set_driver_capabilities(
  p_user_id  uuid,
  p_can_drive boolean,
  p_can_rent  boolean
) returns void language plpgsql security definer as $$
begin
  update public.profiles
  set can_drive = p_can_drive, can_rent = p_can_rent
  where id = p_user_id;
end;
$$;

-- 8. Update handle_new_user trigger to copy can_drive/can_rent from invite
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campus    text;
  v_role      text;
  v_gerak_id  text;
  v_can_drive boolean := false;
  v_can_rent  boolean := false;
  v_invite    public.driver_invites;
begin
  -- Check if this email has a pending driver invite
  select * into v_invite
  from public.driver_invites
  where lower(email) = lower(new.email) and not used;

  if v_invite.id is not null then
    -- Driver registration — campus + role + capabilities from invite
    v_role      := 'driver';
    v_campus    := v_invite.campus;
    v_can_drive := coalesce(v_invite.can_drive, true);
    v_can_rent  := coalesce(v_invite.can_rent,  false);
    if v_campus = 'Pekan' then
      v_gerak_id := 'GDP' || lpad(nextval('gerak_id_gdp_seq')::text, 4, '0');
    else
      v_gerak_id := 'GDG' || lpad(nextval('gerak_id_gdg_seq')::text, 4, '0');
    end if;
    -- Mark invite as used
    update public.driver_invites
      set used = true, used_at = now()
      where id = v_invite.id;
  else
    -- Customer registration — campus from metadata
    v_role   := 'customer';
    v_campus := coalesce(new.raw_user_meta_data->>'campus', '');
    if v_campus = 'Pekan' then
      v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
    else
      v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
    end if;
  end if;

  insert into public.profiles
    (id, name, matric_no, email, phone, university, campus, role, points, gerak_id, can_drive, can_rent)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Student'),
    coalesce(new.raw_user_meta_data->>'matric_no', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'university', ''),
    v_campus,
    v_role,
    100,
    v_gerak_id,
    v_can_drive,
    v_can_rent
  );
  return new;
end;
$$;

-- Re-wire trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
