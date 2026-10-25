-- ============================================================
-- Migration: Record when a Jubah booking became Collected
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- The owner wants to see whether a robe was collected/posted on Friday
-- (23/10) or Saturday (24/10). Nothing stored that date, so:
--  - collected_at, stamped by a trigger whenever status changes to
--    'collected' (manual step, or the tracking-email batch);
--  - backfilled from admin_activity_log for bookings already collected or
--    delivered (latest log entry that moved it to 'collected'), falling
--    back to the tracking email time.

alter table public.jubah_bookings add column if not exists collected_at timestamptz;

create or replace function public.jubah_booking_stamp_collected_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'collected' and (tg_op = 'INSERT' or old.status is distinct from 'collected') then
    new.collected_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists jubah_booking_stamp_collected_at on public.jubah_bookings;
create trigger jubah_booking_stamp_collected_at
  before insert or update of status on public.jubah_bookings
  for each row execute function public.jubah_booking_stamp_collected_at();

with last_collected as (
  select l.record_id, max(l.created_at) as at
  from public.admin_activity_log l
  where l.table_name = 'jubah_bookings'
    and (l.changes->'status'->>'new' = 'collected' or l.changes->'new'->>'status' = 'collected')
  group by l.record_id
)
update public.jubah_bookings b
   set collected_at = coalesce(fc.at, b.tracking_emailed_at)
  from public.jubah_bookings b2
  left join last_collected fc on fc.record_id = b2.id::text
 where b.id = b2.id
   and b.status in ('collected', 'delivered')
   and b.collected_at is null;
