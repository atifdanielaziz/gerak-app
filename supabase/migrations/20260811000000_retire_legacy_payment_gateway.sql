-- Retire the former hosted payment gateway after the move to manual bank
-- transfers and receipt review.
--
-- Preserve historical bill identifiers in a locked archive before removing
-- the live booking columns. Any unresolved ordered booking with a legacy bill
-- is flagged for human reconciliation so the expiry job cannot cancel it.

create table if not exists public.jubah_legacy_gateway_payments (
  booking_id uuid primary key,
  booking_reference text not null,
  initial_bill_code text,
  balance_bill_code text,
  initial_paid boolean not null default false,
  initial_paid_at timestamptz,
  balance_paid boolean not null default false,
  balance_paid_at timestamptz,
  booking_status text not null,
  archived_at timestamptz not null default now()
);

alter table public.jubah_legacy_gateway_payments enable row level security;
revoke all on table public.jubah_legacy_gateway_payments from anon, authenticated;

insert into public.jubah_legacy_gateway_payments (
  booking_id,
  booking_reference,
  initial_bill_code,
  balance_bill_code,
  initial_paid,
  initial_paid_at,
  balance_paid,
  balance_paid_at,
  booking_status
)
select
  id,
  reference,
  toyyibpay_bill_code,
  toyyibpay_balance_bill_code,
  coalesce(initial_paid, false),
  initial_paid_at,
  coalesce(balance_paid, false),
  balance_paid_at,
  status
from public.jubah_bookings
where toyyibpay_bill_code is not null
   or toyyibpay_balance_bill_code is not null
on conflict (booking_id) do update set
  booking_reference = excluded.booking_reference,
  initial_bill_code = excluded.initial_bill_code,
  balance_bill_code = excluded.balance_bill_code,
  initial_paid = excluded.initial_paid,
  initial_paid_at = excluded.initial_paid_at,
  balance_paid = excluded.balance_paid,
  balance_paid_at = excluded.balance_paid_at,
  booking_status = excluded.booking_status,
  archived_at = now();

update public.jubah_bookings
set needs_reconciliation = true,
    reconciliation_note = coalesce(
      nullif(reconciliation_note, ''),
      'Legacy gateway bill found on an unconfirmed booking. Verify the archived payment record before resolving.'
    ),
    reconciliation_flagged_at = coalesce(reconciliation_flagged_at, now())
where status = 'ordered'
  and (toyyibpay_bill_code is not null or toyyibpay_balance_bill_code is not null);

alter table public.jubah_bookings
  drop column if exists toyyibpay_bill_code,
  drop column if exists toyyibpay_balance_bill_code;

comment on table public.jubah_legacy_gateway_payments is
  'Locked historical archive from the retired hosted payment flow; service-role access only.';
