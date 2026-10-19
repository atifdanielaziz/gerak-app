-- ============================================================
-- Migration: Printed / Doc Ready tracking on Jubah bookings
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- The team tracked which bookings' documents were ready and printed in a
-- spreadsheet (JUBAH Customers.xlsx: "Printed", "Doc Reday to Print").
-- Moved into the Customer Directory: two flags staff toggle per booking.
-- Writes go through set_jubah_print_status: admin/superadmin for any
-- booking, a rider for their own assigned bookings. Each change is logged.

alter table public.jubah_bookings
  add column if not exists printed boolean not null default false,
  add column if not exists doc_ready boolean not null default false;

create or replace function public.set_jubah_print_status(p_booking_id uuid, p_printed boolean default null, p_doc_ready boolean default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_role text := coalesce(get_my_role(), '');
  v_b record;
  v_name text;
begin
  select id, rider_id, printed, doc_ready into v_b from public.jubah_bookings where id = p_booking_id;
  if v_b.id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;
  if v_role not in ('admin', 'superadmin') and v_b.rider_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Not allowed.');
  end if;
  if p_printed is null and p_doc_ready is null then
    return jsonb_build_object('success', true);
  end if;

  update public.jubah_bookings
     set printed = coalesce(p_printed, printed),
         doc_ready = coalesce(p_doc_ready, doc_ready)
   where id = p_booking_id;

  select name into v_name from public.profiles where id = auth.uid();
  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (auth.uid(), coalesce(v_name, 'Staff'), v_role, 'jubah_bookings', p_booking_id::text, 'print_status',
          jsonb_strip_nulls(jsonb_build_object(
            'printed',   case when p_printed   is not null then jsonb_build_object('old', v_b.printed,   'new', p_printed)   end,
            'doc_ready', case when p_doc_ready is not null then jsonb_build_object('old', v_b.doc_ready, 'new', p_doc_ready) end)));
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.set_jubah_print_status(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_jubah_print_status(uuid, boolean, boolean) to authenticated;
