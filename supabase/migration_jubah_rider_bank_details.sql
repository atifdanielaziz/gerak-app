-- ============================================================
-- Per-rider bank details for Jubah payments (schema + self-service RPC)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- The rider assigned to a booking is the one who actually watches for the
-- customer's payment to land and manually confirms it, so the account a
-- customer transfers into needs to be that specific rider's own account —
-- not the single shared superadmin bank account this used to be
-- (jubah_bank_name/jubah_bank_account_number/jubah_bank_account_holder in
-- app_settings, see migration_jubah_bank_details.sql). This migration adds
-- the columns; migration_jubah_riders_bank_filter.sql wires them into the
-- customer-facing RPCs.
--
-- Self-service only, per product decision: a rider enters their own bank
-- details, nobody else types them in on their behalf. An admin can still
-- instantly pull a rider out of rotation via the existing can_robe toggle
-- if there's ever a dispute — no separate admin bank-editing path exists.

-- 1) Rider's own bank details — nullable, only meaningful for role='rider'.
alter table public.profiles
  add column if not exists jubah_bank_name            text,
  add column if not exists jubah_bank_account_number   text,
  add column if not exists jubah_bank_account_holder   text;

-- 2) Snapshot taken at booking time — same pattern as the existing
--    denormalized rider_name. A rider could edit their bank details after a
--    customer has already been shown "pay into X"; the booking must keep
--    showing what the customer was actually told, not silently change
--    underneath them. Populated server-side in create_jubah_booking (see
--    migration_jubah_riders_bank_filter.sql), never trusted from the client.
alter table public.jubah_bookings
  add column if not exists rider_bank_name           text,
  add column if not exists rider_bank_account_number  text,
  add column if not exists rider_bank_account_holder  text;

-- 3) Self-service RPC — a rider can only ever update their own row.
create or replace function public.set_rider_bank_details(
  p_bank_name text, p_account_number text, p_account_holder text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'rider') then
    return jsonb_build_object('success', false, 'error', 'Riders only.');
  end if;

  if p_bank_name is null or length(trim(p_bank_name)) = 0 or length(p_bank_name) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid bank name.');
  end if;
  if p_account_number is null or length(trim(p_account_number)) = 0 or length(p_account_number) > 50 then
    return jsonb_build_object('success', false, 'error', 'Invalid account number.');
  end if;
  if p_account_holder is null or length(trim(p_account_holder)) = 0 or length(p_account_holder) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid account holder name.');
  end if;

  update public.profiles
  set jubah_bank_name          = trim(p_bank_name),
      jubah_bank_account_number = trim(p_account_number),
      jubah_bank_account_holder = trim(p_account_holder)
  where id = auth.uid();

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.set_rider_bank_details(text, text, text) from public, anon;
grant execute on function public.set_rider_bank_details(text, text, text) to authenticated;
