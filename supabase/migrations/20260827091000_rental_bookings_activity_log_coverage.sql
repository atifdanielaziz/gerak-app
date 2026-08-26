-- rental_bookings was the one booking table with zero audit coverage —
-- ride_orders and jubah_bookings both log status/cancellation changes,
-- rental_bookings logged nothing at all. An owner or admin changing a
-- booking's status (confirming, cancelling) went completely untracked.
--
-- Allowlist mirrors the jubah_bookings pattern: lifecycle fields only,
-- never notes/license_url/customer contact info sitting in the same row.

drop trigger if exists log_activity on public.rental_bookings;
create trigger log_activity
  after update or delete on public.rental_bookings
  for each row execute function public.log_admin_activity(
    'status,total_price,booking_type'
  );
