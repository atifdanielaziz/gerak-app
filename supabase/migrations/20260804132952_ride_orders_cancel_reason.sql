-- A cancelled order looked identical whether the customer cancelled it
-- themselves, a driver walked away, or the system auto-expired it after
-- 30 minutes of no driver interest — no way to tell which from the
-- customer's own My Orders screen. Only the system-set reason is
-- populated for now (ride-orders-expire-pending); customer/driver-
-- initiated cancels leave this null, same "no reason recorded" meaning
-- it already had.
alter table ride_orders add column if not exists cancel_reason text;
