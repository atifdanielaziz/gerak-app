-- Confirmed live: a customer self-cancelling their own order correctly
-- produced no notification (by design — the elsif only covered "someone
-- else did it"). User wants a Campus Inbox record for every cancellation
-- regardless of who did it, so this adds a self-cancel branch with its
-- own wording ("You cancelled...") alongside the existing auto-expire and
-- admin-cancel branches, instead of silently skipping.

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
    elsif auth.uid() = NEW.customer_id then
      insert into public.notifications (user_id, title, description, type)
      values (
        NEW.customer_id,
        'Booking Cancelled',
        format('You cancelled your ride request for %s, %s.', NEW.date, NEW.time),
        'transport'
      );
    else
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
