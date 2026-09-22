-- send-ride-order-push only ever fired on a new pending order. A driver
-- who'd already accepted a ride and had it pulled out from under them
-- (customer cancels, admin force-cancels) got the in-page-only alert in
-- DriverHome.tsx ("Gerak — Ride Cancelled") if their tab happened to be
-- open — nothing if it wasn't, same gap the whole push feature exists to
-- close. Fires on any UPDATE that lands on status='cancelled' with a
-- driver already assigned, regardless of which path caused it (customer
-- self-cancel, admin force-cancel via update_ride_status, or anything
-- else that flips this column) — the driver needs to know either way.

create or replace function public.notify_cancelled_ride_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled' and NEW.driver_id is not null then
    perform net.http_post(
      url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/send-ride-order-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key')
      ),
      body    := jsonb_build_object('order_id', NEW.id, 'event', 'cancelled')
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists ride_orders_notify_cancel_push on public.ride_orders;
create trigger ride_orders_notify_cancel_push
  after update on public.ride_orders
  for each row
  execute function public.notify_cancelled_ride_order();
