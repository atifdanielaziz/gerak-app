-- The notifications INSERT/DELETE subscription just added in AppContext.tsx
-- was silently non-functional — notifications was never added to the
-- supabase_realtime publication (only jubah_pricing and ride_orders were),
-- so the subscribe() call connected successfully but never actually
-- received any postgres_changes events. Confirmed: the "ghost" test
-- notifications a live session kept showing after they'd already been
-- deleted server-side came from that session's one-time login fetch
-- running before cleanup, not from a working (but un-pruned) realtime
-- feed — the feed was never delivering anything in the first place.
alter publication supabase_realtime add table public.notifications;
