-- ============================================================
-- Migration: Reset J&T dispatch progress
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Superadmin clears the copied/done marks for a university's postage
-- parcels (e.g. after testing the page before the real run). Tracking
-- numbers are kept unless p_include_tracking is true, since those are
-- shown to customers. Per-parcel reset on the J&T page already works
-- through update_jubah_dispatch(p_copied => '{}', p_done => false).

create or replace function public.reset_jubah_dispatch(p_university text, p_include_tracking boolean default false)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  if coalesce(get_my_role(), '') <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  update public.jubah_bookings
     set dispatch_copied = '{}',
         dispatch_done_at = null,
         tracking_no = case when p_include_tracking then null else tracking_no end
   where university_key = p_university
     and (cardinality(dispatch_copied) > 0 or dispatch_done_at is not null or (p_include_tracking and tracking_no is not null));
  get diagnostics v_count = row_count;
  return jsonb_build_object('success', true, 'count', v_count);
end;
$$;
revoke all on function public.reset_jubah_dispatch(text, boolean) from public, anon;
grant execute on function public.reset_jubah_dispatch(text, boolean) to authenticated;
