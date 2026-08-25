-- Customers can no longer cancel Jubah bookings themselves. Cancellation is
-- reserved for an admin/superadmin or the rider assigned to that booking.

revoke execute on function public.cancel_jubah_booking_customer(text, text) from public, anon, authenticated;

create or replace function public.cancel_jubah_booking_admin(
  p_booking_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.get_my_role();
begin
  if not exists (
    select 1
      from public.jubah_bookings
     where id = p_booking_id
       and (rider_id = auth.uid() or v_role in ('admin', 'superadmin'))
  ) then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;

  update public.jubah_bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = case when v_role in ('admin', 'superadmin') then v_role else 'rider' end
   where id = p_booking_id
     and status not in ('cancelled', 'delivered');

  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found or cannot be cancelled from its current status.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.cancel_jubah_booking_admin(uuid) to authenticated;
