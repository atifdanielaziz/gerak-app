-- notify_cancelled_ride_order only ever sent the driver a push — the
-- Campus Inbox entry for the same event was still written client-side in
-- DriverHome.tsx's loadOrders(), meaning it had the exact same reliability
-- gap the customer-side notification (notify_customer_ride_cancelled) was
-- just fixed for: only persisted if the driver's own tab happened to be
-- open and polling at the moment it happened. This adds the same direct
-- table insert here, so the driver's history is reliable regardless of
-- app state too — matching, not just the push, but the full treatment the
-- customer side already gets.

create or replace function public.notify_cancelled_ride_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled' and NEW.driver_id is not null then
    insert into public.notifications (user_id, title, description, type)
    values (
      NEW.driver_id,
      'Ride Cancelled',
      format('Your customer cancelled the %s, %s ride (%s → %s).', NEW.date, NEW.time, NEW.pickup, NEW.destination),
      'transport'
    );
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
