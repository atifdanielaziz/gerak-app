-- ============================================================
-- Fix: "Save Assignment" (Method 1) never actually made a rider
-- bookable — it wrote to a column nothing customer-facing reads.
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Root cause (confirmed live, not assumed):
--   get_active_jubah_riders() — the RPC powering the customer "Select
--   Rider" dropdown — reads EXCLUSIVELY from jubah_rider_assignments.
--   set_rider_jubah_assignment() — bound to the admin sheet's primary
--   "Save Assignment" button — only ever wrote to
--   profiles.jubah_method / profiles.jubah_drop_point, a legacy
--   single-slot column pair from before jubah_rider_assignments
--   existed. The two were never reconciled when the multi-assignment
--   table was introduced, so the main Save button has been a
--   complete no-op for actual rider bookability this whole time —
--   confirmed by both Faten (correctly bookable, has real
--   jubah_rider_assignments rows from being manually added via the
--   "+ Add Assignment" path) and Aqiya (profiles.jubah_method =
--   'postage', toast said "assignment updated", but zero matching row
--   ever existed in jubah_rider_assignments).
--
-- Compounding bug found in the same data: jubah_rider_assignments has
-- no uniqueness guard, so the "+ Add Assignment" path (which DOES
-- write to the right table) can silently create duplicate rows for
-- the same rider+method — confirmed live: Aqiya ended up with two
-- separate 'pickup' rows and zero 'postage' rows, despite her
-- (disconnected) profile column saying 'postage' was intended.

-- 1) Clean up the confirmed-accidental duplicate before adding a
--    uniqueness constraint that would otherwise reject it. Keeps the
--    earliest of the two duplicate rows, drops the later one — pure
--    dedup, not inventing any new data.
delete from public.jubah_rider_assignments a
using public.jubah_rider_assignments b
where a.rider_id = b.rider_id
  and a.method = b.method
  and a.is_active = true and b.is_active = true
  and a.created_at > b.created_at;

-- 2) Guard against this ever happening again, from either write path
--    (the RPC below or the client's direct "+ Add Assignment" insert)
--    — one rider can't have two active assignments for the same
--    method.
create unique index if not exists jubah_rider_assignments_rider_method_active
  on public.jubah_rider_assignments (rider_id, method)
  where is_active = true;

-- 3) Rewritten set_rider_jubah_assignment(): now actually manages a
--    real jubah_rider_assignments row (the rider's earliest/"Method 1"
--    assignment — update it if one exists, insert if this is their
--    first), instead of only touching the disconnected profiles
--    columns. Still mirrors profiles.jubah_method/jubah_drop_point
--    afterward — cheap to keep and nothing currently depends on it
--    being removed, but it is no longer the source of truth for
--    anything.
create or replace function public.set_rider_jubah_assignment(p_user_id uuid, p_method text, p_drop_point text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_role text;
  v_campus      text;
  v_primary_id  uuid;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'superadmin') then
    raise exception 'Unauthorised: admin or superadmin access required';
  end if;

  select campus into v_campus from public.profiles where id = p_user_id and role = 'rider';
  if v_campus is null then
    raise exception 'Rider not found';
  end if;

  select id into v_primary_id
  from public.jubah_rider_assignments
  where rider_id = p_user_id and is_active = true
  order by created_at
  limit 1;

  if v_primary_id is not null then
    update public.jubah_rider_assignments
    set method = p_method, drop_point = p_drop_point
    where id = v_primary_id;
  else
    insert into public.jubah_rider_assignments (rider_id, method, drop_point, campus, is_active)
    values (p_user_id, p_method, p_drop_point, v_campus, true);
  end if;

  update public.profiles
  set jubah_method = p_method, jubah_drop_point = p_drop_point
  where id = p_user_id;
end;
$function$;
