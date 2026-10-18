-- ============================================================
-- Migration: Email J&T tracking numbers to customers
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- J&T staff enter tracking numbers on the dispatch page; superadmin checks
-- them and then sends every not-yet-emailed one in one go from Admin
-- (edge function send-jubah-tracking-emails). tracking_emailed_no records
-- which number the customer was emailed, so the same number is never sent
-- twice, and a corrected number goes out again.

alter table public.jubah_bookings
  add column if not exists tracking_emailed_no text,
  add column if not exists tracking_emailed_at timestamptz;

-- How many tracking emails are waiting, and how many of those have no email
-- address (shown so superadmin knows they'll be skipped).
create or replace function public.count_jubah_tracking_unsent(p_university text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
begin
  if coalesce(get_my_role(), '') <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  return (
    select jsonb_build_object(
      'success', true,
      'pending', count(*) filter (where nullif(btrim(coalesce(email, '')), '') is not null),
      'no_email', count(*) filter (where nullif(btrim(coalesce(email, '')), '') is null),
      'emailed', (select count(*) from public.jubah_bookings x
                   where x.university_key = p_university and x.tracking_no is not null
                     and x.tracking_emailed_no = x.tracking_no))
    from public.jubah_bookings
    where university_key = p_university and status <> 'cancelled'
      and tracking_no is not null and tracking_no is distinct from tracking_emailed_no
  );
end;
$$;
revoke all on function public.count_jubah_tracking_unsent(text) from public, anon;
grant execute on function public.count_jubah_tracking_unsent(text) to authenticated;
