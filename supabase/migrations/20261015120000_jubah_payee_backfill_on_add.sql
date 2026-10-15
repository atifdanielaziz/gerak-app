-- ============================================================
-- Migration: Backfill payee when a rider becomes a direct payee
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- jubah_bookings.payee_rider_id is only set at booking time (or rider
-- change), so bookings made before a rider was added as a direct payee
-- kept showing the shared account — customers saw Atif's bank details on
-- an Adib booking. Fixed once by hand (2026-10-15); this keeps it fixed:
-- adding a rider to jubah_payees also claims their bookings that have no
-- payee yet.

create or replace function public.jubah_payee_claim_existing_bookings()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  update public.jubah_bookings
     set payee_rider_id = new.rider_id
   where rider_id = new.rider_id
     and payee_rider_id is null;
  return new;
end;
$$;

drop trigger if exists jubah_payee_claim_existing_bookings on public.jubah_payees;
create trigger jubah_payee_claim_existing_bookings
  after insert on public.jubah_payees
  for each row execute function public.jubah_payee_claim_existing_bookings();
