-- The customer-side "your booking was cancelled by an admin" notification
-- only ever ran client-side in MyOrders.tsx's polling/realtime diff loop —
-- it only fired if the customer's own tab happened to be open and
-- connected at the exact moment the cancellation happened. Anyone who
-- checked later (the realistic case for "an admin cancelled it while I
-- wasn't looking") got nothing at all — confirmed live: a real admin
-- cancel produced zero Campus Inbox entry for the customer. Same
-- reliability gap the driver push work already fixed on that side; this
-- carries the same fix (server-side, fires unconditionally on the DB
-- write itself) to the customer side, but via a direct table insert
-- rather than push, since there's no customer push subscription
-- infrastructure.
--
-- auth.uid() inside the trigger reflects whoever's session actually made
-- the UPDATE (SECURITY DEFINER on the calling RPC doesn't change this —
-- it only affects permission/RLS checks, not the JWT identity) — so it's
-- an authoritative way to tell "the customer cancelled it themselves"
-- (auth.uid() = NEW.customer_id, no notification needed) from "someone
-- else did" (admin via update_ride_status, or the cron auto-expire —
-- auth.uid() is null there, also distinct from customer_id) without
-- needing any client-side bookkeeping at all.

-- (Diagnostic note, not part of the fix: an early live test of this
-- trigger looked like a false positive on self-cancel — a raw SQL test
-- that set auth.uid() to the customer's own id via the CLI still
-- produced an old-style "cancelled by an admin" notification. Traced to
-- a still-live browser session for that same test account: MyOrders.tsx
-- still had its OLD client-side notification logic deployed at that
-- point, and since the SQL test never went through that browser's own
-- handleCancel button, its self-action tracking correctly had no record
-- of it — so, from that live session's own (soon-to-be-removed) client
-- logic, it legitimately looked like someone else had cancelled it. Not
-- a bug in this trigger: confirmed separately, with a throwaway debug
-- branch swapped in temporarily, that auth.uid() = NEW.customer_id
-- correctly held during that same test and this trigger inserted
-- nothing. The confusion was two independent notification paths
-- disagreeing during the migration window — resolved by this same
-- change removing the old client-side path in MyOrders.tsx.)

create or replace function public.notify_customer_ride_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if NEW.status = 'cancelled' and OLD.status is distinct from 'cancelled' and NEW.customer_id is not null then
    if NEW.cancel_reason is not null then
      insert into public.notifications (user_id, title, description, type)
      values (
        NEW.customer_id,
        'No Driver Found',
        format('Your ride request for %s, %s didn''t get accepted in time and was cancelled. Feel free to try again.', NEW.date, NEW.time),
        'transport'
      );
    elsif auth.uid() is distinct from NEW.customer_id then
      insert into public.notifications (user_id, title, description, type)
      values (
        NEW.customer_id,
        'Booking Cancelled',
        format('Your ride request for %s, %s was cancelled by an admin. Contact support if you have questions.', NEW.date, NEW.time),
        'transport'
      );
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists ride_orders_notify_customer_cancel on public.ride_orders;
create trigger ride_orders_notify_customer_cancel
  after update on public.ride_orders
  for each row
  execute function public.notify_customer_ride_cancelled();
