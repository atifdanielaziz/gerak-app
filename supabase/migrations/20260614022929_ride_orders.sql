-- ============================================================
-- Migration: ride_orders pool + atomic accept + sequences + RLS
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Sequences for race-condition-safe Gerak ID generation
create sequence if not exists gerak_id_gp_seq start 1;
create sequence if not exists gerak_id_gb_seq start 1;

-- 2. Update trigger to use sequences (atomic, no race condition)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_campus   text;
  v_gerak_id text;
begin
  v_campus := coalesce(new.raw_user_meta_data->>'campus', '');
  if v_campus = 'Pekan' then
    v_gerak_id := 'GP' || lpad(nextval('gerak_id_gp_seq')::text, 5, '0');
  else
    v_gerak_id := 'GB' || lpad(nextval('gerak_id_gb_seq')::text, 5, '0');
  end if;

  insert into public.profiles
    (id, name, matric_no, email, phone, university, campus, role, points, gerak_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Student'),
    coalesce(new.raw_user_meta_data->>'matric_no', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'university', ''),
    v_campus,
    'customer',
    100,
    v_gerak_id
  );
  return new;
end;
$$ language plpgsql security definer;

-- 3. Update preview RPC to read from sequence (non-consuming peek)
create or replace function public.get_next_gerak_id(p_campus text)
returns text
language plpgsql
security definer
as $$
declare
  v_prefix  text;
  v_count   bigint;
  v_called  boolean;
begin
  v_prefix := case when p_campus = 'Pekan' then 'GP' else 'GB' end;
  if p_campus = 'Pekan' then
    select last_value, is_called into v_count, v_called from gerak_id_gp_seq;
  else
    select last_value, is_called into v_count, v_called from gerak_id_gb_seq;
  end if;
  return v_prefix || lpad((case when v_called then v_count + 1 else v_count end)::text, 5, '0');
end;
$$;
grant execute on function public.get_next_gerak_id(text) to anon, authenticated;

-- 4. Helper: get current user role (security definer avoids RLS recursion)
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.profiles where id = auth.uid();
$$;
grant execute on function public.get_my_role() to authenticated;

create or replace function public.get_my_campus()
returns text language sql security definer stable as $$
  select campus from public.profiles where id = auth.uid();
$$;
grant execute on function public.get_my_campus() to authenticated;

-- 5. Allow staff to read all profiles (for driver/customer info display)
create policy "Staff can read all profiles"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.get_my_role() in ('driver', 'admin', 'superadmin')
  );

-- 6. ride_orders table — the live booking pool
create table if not exists public.ride_orders (
  id              uuid        default gen_random_uuid() primary key,
  customer_id     uuid        references auth.users(id) on delete cascade not null,
  customer_name   text        not null default '',
  campus          text        not null,
  date            text        not null,
  time            text        not null,
  pickup          text        not null,
  destination     text        not null,
  passengers      integer     not null default 1,
  contact         text        not null,
  fare            text        not null default 'TBC',
  night_charge    integer     not null default 0,
  notes           text        not null default '',
  book_mode       text        not null default 'quick',
  status          text        not null default 'pending'
                  check (status in ('pending','accepted','in_progress','completed','cancelled')),
  driver_id       uuid        references auth.users(id),
  driver_name     text,
  driver_contact  text,
  created_at      timestamptz default now()
);

alter table public.ride_orders enable row level security;

-- Customer: insert own + read own
create policy "customer_insert_ride_order"
  on public.ride_orders for insert
  with check (auth.uid() = customer_id);

create policy "customer_read_own_ride_order"
  on public.ride_orders for select
  using (auth.uid() = customer_id);

-- Driver/Admin/Superadmin: read orders scoped to campus
create policy "staff_read_campus_ride_orders"
  on public.ride_orders for select
  using (
    public.get_my_role() in ('driver', 'admin', 'superadmin')
    and (
      public.get_my_role() = 'superadmin'
      or public.get_my_campus() = campus
    )
  );

-- Driver/Admin/Superadmin: update orders (accept, status change)
create policy "staff_update_ride_orders"
  on public.ride_orders for update
  using (
    public.get_my_role() in ('driver', 'admin', 'superadmin')
    and (
      public.get_my_role() = 'superadmin'
      or public.get_my_campus() = campus
    )
  );

-- Admin/Superadmin: delete/cancel
create policy "admin_delete_ride_orders"
  on public.ride_orders for delete
  using (public.get_my_role() in ('admin', 'superadmin'));

-- 7. Atomic accept RPC — only first driver wins
create or replace function public.accept_ride_order(p_order_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_phone   text;
  v_role    text;
  v_campus  text;
  v_order   public.ride_orders;
begin
  select name, phone, role, campus
    into v_name, v_phone, v_role, v_campus
    from public.profiles where id = auth.uid();

  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  update public.ride_orders
    set status       = 'accepted',
        driver_id    = auth.uid(),
        driver_name  = v_name,
        driver_contact = v_phone
    where id = p_order_id
      and status = 'pending'
      and (v_role = 'superadmin' or campus = v_campus)
  returning * into v_order;

  if v_order.id is null then
    return json_build_object('success', false, 'error', 'Order already taken or not found');
  end if;

  return json_build_object('success', true, 'order_id', v_order.id);
end;
$$;
grant execute on function public.accept_ride_order(uuid) to authenticated;

-- 8. Status update RPC (driver updates their accepted order)
create or replace function public.update_ride_status(p_order_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  update public.ride_orders
    set status = p_status
    where id = p_order_id
      and (driver_id = auth.uid() or v_role in ('admin', 'superadmin'));

  return json_build_object('success', true);
end;
$$;
grant execute on function public.update_ride_status(uuid, text) to authenticated;

-- 9. Enable Realtime for live order pool updates
alter publication supabase_realtime add table public.ride_orders;
