-- get_active_jubah_riders() (the RPC behind the customer-facing "Select
-- Rider" dropdown) deliberately masks ic_number to the first 6 digits +
-- XX-XXXX — that RPC is reachable by anyone loading the public booking
-- form, so it never sends a rider's full government ID to the browser.
-- Customers do have a legitimate need for the full number though (it goes
-- on the university's representative/robe-collection authorization form),
-- previously only obtainable by messaging the rider directly on WhatsApp.
--
-- This adds a narrow, separate reveal path: given a specific rider id, return
-- their full ic_number — but ONLY if they're currently one of the active,
-- bookable riders (same eligibility filter as get_active_jubah_riders,
-- minus the campus/method/order-cap narrowing, which isn't needed for a
-- single already-chosen rider). This doesn't change who's exposed (these
-- riders' masked IC is already visible to the same audience) — it changes
-- how much of their own number is revealed, and only on an explicit
-- per-rider request, not as a bulk list. Rate-limited the same way every
-- other anon-callable Jubah RPC touching PII is, since there's no identity
-- check on the caller here (the booking form has none at this step).
create or replace function public.get_jubah_rider_full_ic(p_rider_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ic text;
begin
  perform public.check_jubah_rate_limit();

  select ic_number into v_ic
  from public.profiles
  where id = p_rider_id
    and role in ('rider', 'driver', 'admin', 'superadmin')
    and can_robe = true
    and status = 'active';

  if v_ic is null then
    return jsonb_build_object('success', false, 'error', 'Not available.');
  end if;

  return jsonb_build_object('success', true, 'ic_number', v_ic);
end;
$$;
