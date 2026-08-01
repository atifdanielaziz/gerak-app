-- ============================================================
-- Jubah cancellation: only the assigned rider or superadmin
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Same product decision as migration_jubah_confirm_superadmin_rider_only.sql,
-- extended to cancellation — a regular admin should be view-only here too.
-- cancel_jubah_booking_admin previously allowed 'admin' or 'superadmin' but
-- never the assigned rider at all; now it's rider_id = auth.uid() or
-- 'superadmin', matching the confirm/balance authorization exactly.
-- cancelled_by now records which of the two actually did it instead of
-- always hardcoding 'admin', keeping the audit trail meaningful.

create or replace function public.cancel_jubah_booking_admin(
  p_booking_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if not exists (
    select 1 from public.jubah_bookings
    where id = p_booking_id
      and (rider_id = auth.uid() or public.get_my_role() = 'superadmin')
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;

  v_role := public.get_my_role();

  update public.jubah_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = case when v_role = 'superadmin' then 'superadmin' else 'rider' end
   where id = p_booking_id
     and status not in ('cancelled', 'delivered');

  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or cannot be cancelled from its current status.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;
