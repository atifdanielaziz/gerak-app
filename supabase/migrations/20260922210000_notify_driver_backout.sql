-- Confirmed live via admin_activity_log: a driver accepting then backing
-- out of their own job within the 3-minute window (cancel_ride_order —
-- driver_id -> null, status accepted -> pending) correctly produced no
-- notification under the existing rule (no notification for your own
-- action) — same rule that originally applied to customer self-cancel
-- too, before that was changed to notify anyway for a full history. Same
-- treatment here for consistency: a Campus Inbox entry, not a push (the
-- driver is actively in the app doing this, unlike a job someone else
-- cancels while they're not looking).

create or replace function public.notify_driver_backed_out()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if OLD.status = 'accepted' and NEW.status = 'pending' and OLD.driver_id is not null and NEW.driver_id is null then
    insert into public.notifications (user_id, title, description, type)
    values (
      OLD.driver_id,
      'Job Returned to Pool',
      format('You returned the %s, %s ride (%s → %s) back to the pool.', NEW.date, NEW.time, NEW.pickup, NEW.destination),
      'transport'
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists ride_orders_notify_driver_backout on public.ride_orders;
create trigger ride_orders_notify_driver_backout
  after update on public.ride_orders
  for each row
  execute function public.notify_driver_backed_out();
