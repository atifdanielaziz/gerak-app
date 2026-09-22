-- endpoint was globally unique, so the same browser subscribing under a
-- second account (this team tests with multiple real accounts on shared
-- devices constantly — confirmed earlier this session) would try to
-- upsert a row it doesn't own, and RLS's "user_id = auth.uid()" on the
-- UPDATE path silently blocks it. Uniqueness now applies per (user_id,
-- endpoint) instead, so the same device can hold one row per account —
-- each is a genuinely distinct, independently-eligible recipient anyway.

alter table public.push_subscriptions drop constraint push_subscriptions_endpoint_key;
alter table public.push_subscriptions add constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint);
