-- Drivers said the WhatsApp group is more reliable than Gerak's own new-
-- order alert. Root cause: the existing alert is a plain in-page
-- Notification() call fired off a live Supabase Realtime subscription
-- (DriverHome.tsx) — it only fires while the app is open and connected.
-- No service worker push handler existed at all, so a driver with the
-- screen off or the app backgrounded/closed got nothing, while WhatsApp's
-- real OS-level push always reaches them. This adds real Web Push:
-- push_subscriptions stores each driver's browser subscription, and an
-- AFTER INSERT trigger on ride_orders calls a new edge function
-- (send-ride-order-push) immediately — not on a cron delay, since the
-- whole point is a same-second alert — which sends to every eligible
-- driver's subscription via VAPID.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- A driver only ever needs to manage their own device subscriptions; the
-- edge function reads across everyone via the service role key, which
-- bypasses RLS entirely, so no separate admin-read policy is needed here.
create policy "push_subscriptions_own_all" on public.push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

create or replace function public.notify_new_ride_order()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Only a freshly-created open request needs a push — anything inserted
  -- with a different status (shouldn't normally happen, but keeps this
  -- narrowly scoped to its actual purpose either way).
  if NEW.status = 'pending' then
    perform net.http_post(
      url     := 'https://koyyautvmimuhjygqqfv.supabase.co/functions/v1/send-ride-order-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_service_role_key')
      ),
      body    := jsonb_build_object('order_id', NEW.id)
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists ride_orders_notify_push on public.ride_orders;
create trigger ride_orders_notify_push
  after insert on public.ride_orders
  for each row
  execute function public.notify_new_ride_order();
