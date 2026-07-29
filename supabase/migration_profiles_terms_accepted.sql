-- Records when a user ticked the Terms & Conditions / Privacy Policy
-- consent checkbox at sign-up (Register.tsx) — an audit trail of consent,
-- not just a client-side gate. Nullable: existing accounts created before
-- this checkbox existed simply have no timestamp, which is accurate.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;
