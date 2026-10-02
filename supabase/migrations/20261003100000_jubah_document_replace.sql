-- Lets a customer (self-service), the assigned rider, or superadmin
-- replace a wrongly-uploaded Jubah document (OSCAR/SKPG/Konvo/IC —
-- deliberately not the Combined PDF, which is generated from these, not
-- uploaded directly). Locked once Robe Status (jubah_bookings.status)
-- passes 'paid' — enforced here, in the function itself, not just hidden
-- in the UI, so it can't be bypassed by calling the RPC directly.
--
-- The actual file upload still goes straight from the client to the
-- jubah-docs bucket (already open to anon+authenticated for INSERT, same
-- as the original booking flow) — these functions are the real security
-- boundary: they're what decides whether a booking's record gets
-- re-pointed at the newly uploaded file.

-- get_jubah_receipt needs the four document paths added so the customer
-- UI (gated behind the exact same reference + last-4-IC check this
-- function already performs) knows what's currently uploaded.
drop function if exists public.get_jubah_receipt(text, text);

create or replace function public.get_jubah_receipt(p_reference text, p_ic_last4 text)
returns table(
  id uuid, reference text, full_name text, ic_number text, hp_number text, email text,
  campus text, faculty text, university text, matric_id text, remark text, status text,
  payment_mode text, rider_name text, rider_phone text, cost numeric, balance_due numeric,
  balance_paid boolean, balance_paid_at timestamptz, initial_paid boolean, initial_paid_at timestamptz,
  delivery_address text, created_at timestamptz,
  oscar_path text, skpg_path text, konvo_path text, ic_path text
)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.check_jubah_rate_limit();

  return query
  select jb.id, jb.reference, jb.full_name,
         case
           when jb.ic_number is null then null
           when length(regexp_replace(jb.ic_number, '\D', '', 'g')) < 6 then null
           else substring(regexp_replace(jb.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
         end as ic_number,
         jb.hp_number, jb.email, jb.campus, jb.faculty, jb.university, jb.matric_id, jb.remark,
         jb.status, jb.payment_mode, jb.rider_name, p.phone as rider_phone,
         jb.cost, jb.balance_due, jb.balance_paid, jb.balance_paid_at,
         jb.initial_paid, jb.initial_paid_at,
         jb.delivery_address, jb.created_at,
         jb.oscar_path, jb.skpg_path, jb.konvo_path, jb.ic_path
  from public.jubah_bookings jb
  left join public.profiles p on p.id = jb.rider_id
  where jb.reference = p_reference
    and right(regexp_replace(jb.ic_number, '\D', '', 'g'), 4) = p_ic_last4;
end;
$$;

-- Customer self-service replace — same reference + last-4-IC gate as
-- get_jubah_receipt above (the existing "prove it's really you" check
-- this page already makes customers pass before they see the receipt).
create or replace function public.customer_replace_jubah_document(
  p_reference text,
  p_ic_last4 text,
  p_document_field text,
  p_new_path text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_booking record;
  v_old_path text;
begin
  perform public.check_jubah_rate_limit();

  if p_document_field not in ('oscar', 'skpg', 'konvo', 'ic') then
    return jsonb_build_object('success', false, 'error', 'Invalid document field.');
  end if;

  select id, status, full_name, ic_number, oscar_path, skpg_path, konvo_path, ic_path
    into v_booking
    from public.jubah_bookings
    where reference = p_reference;

  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;

  if right(regexp_replace(coalesce(v_booking.ic_number, ''), '\D', '', 'g'), 4) <> p_ic_last4 then
    return jsonb_build_object('success', false, 'error', 'Incorrect IC digits.');
  end if;

  if v_booking.status not in ('ordered', 'paid') then
    return jsonb_build_object('success', false, 'error', 'This order is already being processed and can no longer be edited.');
  end if;

  v_old_path := case p_document_field
    when 'oscar' then v_booking.oscar_path
    when 'skpg'  then v_booking.skpg_path
    when 'konvo' then v_booking.konvo_path
    when 'ic'    then v_booking.ic_path
  end;

  if p_document_field = 'oscar' then
    update public.jubah_bookings set oscar_path = p_new_path where id = v_booking.id;
  elsif p_document_field = 'skpg' then
    update public.jubah_bookings set skpg_path = p_new_path where id = v_booking.id;
  elsif p_document_field = 'konvo' then
    update public.jubah_bookings set konvo_path = p_new_path where id = v_booking.id;
  elsif p_document_field = 'ic' then
    update public.jubah_bookings set ic_path = p_new_path where id = v_booking.id;
  end if;

  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (
    null, coalesce(v_booking.full_name, 'Customer') || ' (self-service)', 'customer',
    'jubah_bookings', v_booking.id::text, 'replace_document',
    jsonb_build_object('field', p_document_field, 'old_path', v_old_path, 'new_path', p_new_path)
  );

  return jsonb_build_object('success', true);
end;
$$;

-- Rider (their own assigned bookings only) / superadmin (any booking).
create or replace function public.staff_replace_jubah_document(
  p_booking_id uuid,
  p_document_field text,
  p_new_path text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role text := public.get_my_role();
  v_actor_name text;
  v_booking record;
  v_old_path text;
begin
  if p_document_field not in ('oscar', 'skpg', 'konvo', 'ic') then
    return jsonb_build_object('success', false, 'error', 'Invalid document field.');
  end if;

  select id, status, rider_id, oscar_path, skpg_path, konvo_path, ic_path
    into v_booking
    from public.jubah_bookings
    where id = p_booking_id;

  if v_booking.id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;

  if not (v_role = 'superadmin' or v_booking.rider_id = auth.uid()) then
    return jsonb_build_object('success', false, 'error', 'Not authorised.');
  end if;

  if v_booking.status not in ('ordered', 'paid') then
    return jsonb_build_object('success', false, 'error', 'This order is already being processed and can no longer be edited.');
  end if;

  v_old_path := case p_document_field
    when 'oscar' then v_booking.oscar_path
    when 'skpg'  then v_booking.skpg_path
    when 'konvo' then v_booking.konvo_path
    when 'ic'    then v_booking.ic_path
  end;

  if p_document_field = 'oscar' then
    update public.jubah_bookings set oscar_path = p_new_path where id = v_booking.id;
  elsif p_document_field = 'skpg' then
    update public.jubah_bookings set skpg_path = p_new_path where id = v_booking.id;
  elsif p_document_field = 'konvo' then
    update public.jubah_bookings set konvo_path = p_new_path where id = v_booking.id;
  elsif p_document_field = 'ic' then
    update public.jubah_bookings set ic_path = p_new_path where id = v_booking.id;
  end if;

  select name into v_actor_name from public.profiles where id = auth.uid();

  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (
    auth.uid(), coalesce(v_actor_name, 'Unknown'), v_role,
    'jubah_bookings', v_booking.id::text, 'replace_document',
    jsonb_build_object('field', p_document_field, 'old_path', v_old_path, 'new_path', p_new_path)
  );

  return jsonb_build_object('success', true);
end;
$$;
