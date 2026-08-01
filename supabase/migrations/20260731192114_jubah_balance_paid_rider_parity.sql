-- ============================================================
-- Let the assigned rider confirm their own booking's balance payment
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- update_jubah_booking_status already permits the assigned rider
-- (rider_id = auth.uid()) alongside admin/superadmin — see
-- migration_jubah_status_transition_guard.sql. mark_jubah_balance_paid
-- was the one remaining asymmetry, hard-requiring admin/superadmin. Since
-- it's the rider who actually watches for the customer's payment and
-- already confirms the initial payment, they should be able to confirm the
-- balance too, scoped strictly to bookings assigned to them. Return type
-- unchanged, so CREATE OR REPLACE is safe.

create or replace function public.mark_jubah_balance_paid(
  p_booking_id uuid
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.jubah_bookings
    where id = p_booking_id
      and (rider_id = auth.uid() or public.get_my_role() in ('admin', 'superadmin'))
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;

  update public.jubah_bookings
     set balance_paid    = true,
         balance_paid_at = now()
   where id = p_booking_id
     and status <> 'cancelled';

  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or has been cancelled.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.mark_jubah_balance_paid(uuid) to authenticated;
