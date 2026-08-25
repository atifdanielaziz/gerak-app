-- Jubah Lead is a Jubah-scoped role, not a global profiles.role value.
-- Leads can oversee multiple universities and may manage bookings only in
-- those universities. A runner can report to only one lead/university.

create table if not exists public.jubah_leads (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jubah_lead_universities (
  lead_id uuid not null references public.jubah_leads(user_id) on delete cascade,
  university_key text not null check (university_key in (
    'umpsa','uitm','umk','ukm','uiam','uum','unisza','utp','upm','um','upsi','ums','unimas'
  )),
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (lead_id, university_key)
);

create table if not exists public.jubah_lead_runners (
  runner_id uuid primary key references public.profiles(id) on delete cascade,
  lead_id uuid not null references public.jubah_leads(user_id) on delete cascade,
  university_key text not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (lead_id, university_key)
    references public.jubah_lead_universities(lead_id, university_key)
    on delete cascade
);

create index if not exists jubah_lead_universities_key_idx
  on public.jubah_lead_universities(university_key, lead_id);
create index if not exists jubah_lead_runners_lead_idx
  on public.jubah_lead_runners(lead_id, university_key);

alter table public.jubah_leads enable row level security;
alter table public.jubah_lead_universities enable row level security;
alter table public.jubah_lead_runners enable row level security;

create or replace function public.is_active_jubah_lead(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jubah_leads l
    where l.user_id = p_user_id and l.is_active
  );
$$;

create or replace function public.jubah_lead_can_manage_university(
  p_university_key text,
  p_user_id uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.jubah_leads l
    join public.jubah_lead_universities lu on lu.lead_id = l.user_id
    where l.user_id = p_user_id
      and l.is_active
      and lu.university_key = lower(trim(p_university_key))
  );
$$;

revoke all on function public.is_active_jubah_lead(uuid) from public, anon;
revoke all on function public.jubah_lead_can_manage_university(text, uuid) from public, anon;
grant execute on function public.is_active_jubah_lead(uuid) to authenticated;
grant execute on function public.jubah_lead_can_manage_university(text, uuid) to authenticated;

drop policy if exists jubah_leads_self_or_superadmin_read on public.jubah_leads;
create policy jubah_leads_self_or_superadmin_read on public.jubah_leads
  for select to authenticated
  using (user_id = auth.uid() or public.get_my_role() = 'superadmin');

drop policy if exists jubah_lead_universities_self_or_superadmin_read on public.jubah_lead_universities;
create policy jubah_lead_universities_self_or_superadmin_read on public.jubah_lead_universities
  for select to authenticated
  using (lead_id = auth.uid() or public.get_my_role() = 'superadmin');

drop policy if exists jubah_lead_runners_lead_runner_or_superadmin_read on public.jubah_lead_runners;
create policy jubah_lead_runners_lead_runner_or_superadmin_read on public.jubah_lead_runners
  for select to authenticated
  using (lead_id = auth.uid() or runner_id = auth.uid() or public.get_my_role() = 'superadmin');

-- One superadmin-owned RPC atomically creates/updates a Lead and replaces
-- their university scope. It prevents half-applied assignments.
create or replace function public.set_jubah_lead(
  p_user_id uuid,
  p_university_keys text[],
  p_active boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  if public.get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_user_id and role in ('admin', 'driver', 'rider')
  ) then
    return jsonb_build_object('success', false, 'error', 'Select an admin, driver or rider account.');
  end if;
  if p_active and coalesce(cardinality(p_university_keys), 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'Assign at least one university.');
  end if;

  insert into public.jubah_leads(user_id, is_active, created_by)
  values (p_user_id, p_active, auth.uid())
  on conflict (user_id) do update
    set is_active = excluded.is_active, updated_at = now();

  delete from public.jubah_lead_universities where lead_id = p_user_id;
  foreach v_key in array coalesce(p_university_keys, array[]::text[]) loop
    insert into public.jubah_lead_universities(lead_id, university_key, assigned_by)
    values (p_user_id, lower(trim(v_key)), auth.uid());
  end loop;
  return jsonb_build_object('success', true);
exception when check_violation or foreign_key_violation then
  return jsonb_build_object('success', false, 'error', 'One or more university assignments are invalid.');
end;
$$;

create or replace function public.assign_jubah_runner_to_lead(
  p_runner_id uuid,
  p_lead_id uuid,
  p_university_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if public.get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_runner_id and p.role = 'rider' and coalesce(p.can_robe, false)
  ) then
    return jsonb_build_object('success', false, 'error', 'Select an active Jubah rider.');
  end if;
  if not exists (
    select 1 from public.jubah_lead_universities
    where lead_id = p_lead_id and university_key = lower(trim(p_university_key))
  ) then
    return jsonb_build_object('success', false, 'error', 'The Lead is not assigned to this university.');
  end if;
  insert into public.jubah_lead_runners(runner_id, lead_id, university_key, assigned_by)
  values (p_runner_id, p_lead_id, lower(trim(p_university_key)), auth.uid())
  on conflict (runner_id) do update
    set lead_id = excluded.lead_id,
        university_key = excluded.university_key,
        assigned_by = auth.uid(),
        created_at = now();
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.set_jubah_lead(uuid, text[], boolean) from public, anon;
revoke all on function public.assign_jubah_runner_to_lead(uuid, uuid, text) from public, anon;
grant execute on function public.set_jubah_lead(uuid, text[], boolean) to authenticated;
grant execute on function public.assign_jubah_runner_to_lead(uuid, uuid, text) to authenticated;

-- Scoped booking visibility and deletion. Existing admin/rider/customer
-- policies remain intact; this policy only adds Lead access.
drop policy if exists jubah_lead_read_assigned_universities on public.jubah_bookings;
create policy jubah_lead_read_assigned_universities on public.jubah_bookings
  for select to authenticated
  using (public.jubah_lead_can_manage_university(university_key));

drop policy if exists jubah_lead_delete_assigned_universities on public.jubah_bookings;
create policy jubah_lead_delete_assigned_universities on public.jubah_bookings
  for delete to authenticated
  using (public.jubah_lead_can_manage_university(university_key));

-- Extend cancellation with university-scoped Lead access.
create or replace function public.cancel_jubah_booking_admin(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.get_my_role();
begin
  if not exists (
    select 1 from public.jubah_bookings b
    where b.id = p_booking_id
      and (
        b.rider_id = auth.uid()
        or v_role in ('admin', 'superadmin')
        or public.jubah_lead_can_manage_university(b.university_key)
      )
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  update public.jubah_bookings
     set status = 'cancelled', cancelled_at = now(),
         cancelled_by = case
           when v_role in ('admin', 'superadmin') then v_role
           when public.is_active_jubah_lead() then 'jubah_lead'
           else 'rider' end
   where id = p_booking_id and status not in ('cancelled', 'delivered');
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or cannot be cancelled from its current status.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.cancel_jubah_booking_admin(uuid) from public, anon;
grant execute on function public.cancel_jubah_booking_admin(uuid) to authenticated;

-- Patch only the authorisation predicate of the current hardened status RPC.
-- The remaining status-transition, balance and commission logic is retained.
create or replace function public.jubah_lead_can_manage_booking(p_booking_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jubah_bookings b
    where b.id = p_booking_id
      and public.jubah_lead_can_manage_university(b.university_key)
  );
$$;
revoke all on function public.jubah_lead_can_manage_booking(uuid) from public, anon;
grant execute on function public.jubah_lead_can_manage_booking(uuid) to authenticated;

create or replace function public.update_jubah_booking_status(p_booking_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_booking public.jubah_bookings;
  v_steps text[];
  v_cur_idx int;
  v_next text;
  v_is_terminal boolean := false;
  v_delivery_type text;
  v_amount numeric;
begin
  select * into v_booking from public.jubah_bookings
  where id = p_booking_id
    and (
      rider_id = auth.uid()
      or public.get_my_role() in ('admin', 'superadmin')
      or public.jubah_lead_can_manage_university(university_key)
    );
  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if v_booking.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;
  if v_booking.status = 'ordered' then
    v_next := 'paid';
  else
    v_steps := case v_booking.payment_mode
      when 'deposit' then array['paid', 'processing', 'collected', 'delivered']
      when 'postage' then array['paid', 'processing', 'collected', 'delivered']
      else array['paid', 'processing', 'collected', 'delivered'] end;
    v_cur_idx := array_position(v_steps, v_booking.status);
    if v_cur_idx is null or v_cur_idx = array_length(v_steps, 1) then
      return jsonb_build_object('success', false, 'error', 'This booking cannot be advanced further.');
    end if;
    v_next := v_steps[v_cur_idx + 1];
    v_is_terminal := (v_cur_idx + 1 = array_length(v_steps, 1));
  end if;
  if p_status <> v_next then
    return jsonb_build_object('success', false, 'error', 'Invalid status transition.');
  end if;
  if v_booking.payment_mode = 'deposit' and not v_booking.balance_paid and p_status <> 'paid' then
    return jsonb_build_object('success', false, 'error', 'Balance payment must be confirmed before advancing this booking further.');
  end if;
  if v_is_terminal and v_booking.rider_id is not null and v_booking.rider_commission_amount is null then
    v_delivery_type := case when (v_booking.payment_mode = 'postage'
      or (v_booking.payment_mode = 'deposit' and v_booking.delivery_address is not null))
      then 'postage' else 'pickup' end;
    select coalesce(amount, 0) into v_amount
      from public.jubah_rider_commission
      where delivery_type = v_delivery_type and university = v_booking.university_key;
    update public.jubah_bookings set
      status = p_status,
      rider_commission_rate = null,
      rider_commission_amount = coalesce(v_amount, 0),
      rider_commission_earned_at = now()
      where id = p_booking_id;
  else
    update public.jubah_bookings set
      status = p_status,
      initial_paid = case when v_booking.status = 'ordered' then true else initial_paid end,
      initial_paid_at = case when v_booking.status = 'ordered' then now() else initial_paid_at end
      where id = p_booking_id;
  end if;
  return jsonb_build_object('success', true);
exception when others then
  raise warning 'update_jubah_booking_status failed: % (sqlstate %)', sqlerrm, sqlstate;
  return jsonb_build_object('success', false, 'error', 'Something went wrong updating this booking. Please try again, or contact admin if this keeps happening.');
end;
$$;
revoke all on function public.update_jubah_booking_status(uuid, text) from public, anon;
grant execute on function public.update_jubah_booking_status(uuid, text) to authenticated;

-- Leads can also confirm a deposit balance before advancing processing.
create or replace function public.mark_jubah_balance_paid(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.jubah_bookings b
    where b.id = p_booking_id
      and (
        b.rider_id = auth.uid()
        or public.get_my_role() in ('admin', 'superadmin')
        or public.jubah_lead_can_manage_university(b.university_key)
      )
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  update public.jubah_bookings
     set balance_paid = true, balance_paid_at = now()
   where id = p_booking_id and status <> 'cancelled';
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or has been cancelled.');
  end if;
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.mark_jubah_balance_paid(uuid) from public, anon;
grant execute on function public.mark_jubah_balance_paid(uuid) to authenticated;
