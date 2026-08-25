-- Quote creation, verification, and consumption all use pgcrypto. Supabase
-- installs pgcrypto in the extensions schema, so every RPC in this flow must
-- include it in its locked search path.
alter function public.resolve_jubah_custom_quote(text, text)
  set search_path = public, extensions;

alter function public.create_custom_jubah_booking(text, jsonb)
  set search_path = public, extensions;

