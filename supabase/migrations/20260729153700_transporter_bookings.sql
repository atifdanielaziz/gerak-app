-- ============================================================
-- Migration: Gerak Transporter bookings (in-app request, price TBC)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Gerak Transporter has no registered driver/provider accounts in this
-- app — "Khai Transporter" is a single hardcoded external contact
-- (see GerakTransporter.tsx's PROVIDER constant), and price is always
-- negotiated over WhatsApp after this booking is made, never computed
-- or trusted from the client. This table exists purely so the customer
-- gets an Activity/My Orders record and admin gets visibility — it is
-- NOT a dispatch/acceptance system like ride_orders.

create table if not exists public.transporter_bookings (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references auth.users(id) on delete cascade,
  customer_name   text not null,
  contact         text not null,
  services        text[] not null,
  pickup          text not null,
  destination     text not null,
  notes           text,
  provider_name   text not null default 'Khai Transporter',
  provider_phone  text not null default '0133978113',
  status          text not null default 'pending',
  created_at      timestamptz not null default now()
);

alter table public.transporter_bookings enable row level security;

drop policy if exists "transporter_bookings_customer_select" on public.transporter_bookings;
create policy "transporter_bookings_customer_select"
  on public.transporter_bookings for select
  to authenticated
  using (customer_id = auth.uid());

drop policy if exists "transporter_bookings_admin_select" on public.transporter_bookings;
create policy "transporter_bookings_admin_select"
  on public.transporter_bookings for select
  to authenticated
  using (public.get_my_role() in ('admin', 'superadmin'));

-- Status changes (e.g. admin marking a request contacted/completed/
-- cancelled) are admin/superadmin only — no customer or anon write path
-- at all, direct-table or otherwise. Customers only ever create rows,
-- via the RPC below, never update them.
drop policy if exists "transporter_bookings_admin_update" on public.transporter_bookings;
create policy "transporter_bookings_admin_update"
  on public.transporter_bookings for update
  to authenticated
  using (public.get_my_role() in ('admin', 'superadmin'))
  with check (public.get_my_role() in ('admin', 'superadmin'));

-- No INSERT policy/grant for authenticated on the table directly —
-- creation only happens through create_transporter_booking below, which
-- validates input server-side and always sets customer_id = auth.uid()
-- itself (never trusts a client-supplied customer id).

create or replace function public.create_transporter_booking(
  p_services text[], p_pickup text, p_destination text, p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id   uuid := auth.uid();
  v_customer_name text;
  v_contact       text;
  v_booking_id    uuid;
  v_service       text;
  v_allowed       text[] := array['motorcycle', 'pindah_barang'];
begin
  if v_customer_id is null then
    return jsonb_build_object('success', false, 'error', 'You must be logged in to book.');
  end if;

  if p_services is null or array_length(p_services, 1) is null then
    return jsonb_build_object('success', false, 'error', 'Select at least one service.');
  end if;

  foreach v_service in array p_services loop
    if not (v_service = any(v_allowed)) then
      return jsonb_build_object('success', false, 'error', 'Invalid service selected.');
    end if;
  end loop;

  if coalesce(trim(p_pickup), '') = '' or coalesce(trim(p_destination), '') = '' then
    return jsonb_build_object('success', false, 'error', 'Pickup and destination are required.');
  end if;

  if length(p_pickup) > 200 or length(p_destination) > 200 or length(coalesce(p_notes, '')) > 500 then
    return jsonb_build_object('success', false, 'error', 'One of the fields is too long.');
  end if;

  select name, phone into v_customer_name, v_contact
  from public.profiles where id = v_customer_id;

  insert into public.transporter_bookings (customer_id, customer_name, contact, services, pickup, destination, notes)
  values (
    v_customer_id,
    coalesce(v_customer_name, 'Student'),
    coalesce(v_contact, ''),
    p_services,
    trim(p_pickup),
    trim(p_destination),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_booking_id;

  return jsonb_build_object('success', true, 'id', v_booking_id);
end;
$$;
grant execute on function public.create_transporter_booking(text[], text, text, text) to authenticated;
