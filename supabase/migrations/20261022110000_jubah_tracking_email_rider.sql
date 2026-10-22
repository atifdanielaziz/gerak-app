-- ============================================================
-- Migration: Riders send tracking emails for their own parcels
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Owner's choice: besides superadmin's send-all in Admin, each rider can
-- check and send the J&T tracking emails for their own bookings from the
-- Rider Hub. The count below follows the same scope as the edge function
-- (send-jubah-tracking-emails): superadmin = the whole university,
-- anyone else = only bookings where they are the rider.

create or replace function public.count_jubah_tracking_unsent(p_university text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_all boolean := coalesce(get_my_role(), '') = 'superadmin';
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Not signed in.');
  end if;
  return (
    select jsonb_build_object(
      'success', true,
      'pending', count(*) filter (where tracking_no is distinct from tracking_emailed_no and nullif(btrim(coalesce(email, '')), '') is not null),
      'no_email', count(*) filter (where tracking_no is distinct from tracking_emailed_no and nullif(btrim(coalesce(email, '')), '') is null),
      'emailed', count(*) filter (where tracking_emailed_no = tracking_no))
    from public.jubah_bookings
    where university_key = p_university and status <> 'cancelled' and tracking_no is not null
      and (v_all or rider_id = auth.uid())
  );
end;
$$;
revoke all on function public.count_jubah_tracking_unsent(text) from public, anon;
grant execute on function public.count_jubah_tracking_unsent(text) to authenticated;
