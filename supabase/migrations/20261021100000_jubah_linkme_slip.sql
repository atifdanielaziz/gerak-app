-- ============================================================
-- Migration: LinkMe verification slip on Jubah bookings
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- UMPSA's alumni centre replaced OSCAR with LinkMe; the souvenir counter at
-- robe collection asks for the LinkMe "Official Profile Verification Slip".
-- Staff WhatsApp customers a link (gerakmy.com/jubah/linkme?ref=...);
-- the customer enters the last 4 IC digits and uploads just that slip.
-- Same reference + last-4-IC gate as the other customer self-service
-- RPCs, but no Robe Status lock: the slip is needed at collection itself.
-- Not part of the Combined PDF (owner's call).

alter table public.jubah_bookings
  add column if not exists linkme_path text,
  add column if not exists linkme_uploaded_at timestamptz;

-- What the upload page needs after the IC check.
create or replace function public.get_jubah_linkme_status(p_reference text, p_ic_last4 text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_b record;
begin
  perform public.check_jubah_rate_limit();
  select id, full_name, faculty, campus, ic_number, status, linkme_path, linkme_uploaded_at
    into v_b from public.jubah_bookings where reference = p_reference;
  if v_b.id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;
  if right(regexp_replace(coalesce(v_b.ic_number, ''), '\D', '', 'g'), 4) <> coalesce(p_ic_last4, '') then
    return jsonb_build_object('success', false, 'error', 'Incorrect IC digits.');
  end if;
  if v_b.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;
  return jsonb_build_object('success', true, 'full_name', v_b.full_name, 'faculty', v_b.faculty, 'campus', v_b.campus,
                            'uploaded', v_b.linkme_path is not null, 'uploaded_at', v_b.linkme_uploaded_at);
end;
$$;
revoke all on function public.get_jubah_linkme_status(text, text) from public;
grant execute on function public.get_jubah_linkme_status(text, text) to anon, authenticated;

create or replace function public.customer_upload_jubah_linkme(p_reference text, p_ic_last4 text, p_path text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_b record;
begin
  perform public.check_jubah_rate_limit();
  select id, full_name, ic_number, status, linkme_path into v_b from public.jubah_bookings where reference = p_reference;
  if v_b.id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;
  if right(regexp_replace(coalesce(v_b.ic_number, ''), '\D', '', 'g'), 4) <> coalesce(p_ic_last4, '') then
    return jsonb_build_object('success', false, 'error', 'Incorrect IC digits.');
  end if;
  if v_b.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'This booking has been cancelled.');
  end if;
  -- Only a file this booking's own folder, named the way the page names it.
  if p_path is null or p_path !~ ('^' || regexp_replace(p_reference, '([^A-Za-z0-9])', '\\\1', 'g') || '/linkme_[0-9]+\.(pdf|jpg|jpeg|png|webp)$')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'jubah-docs' and o.name = p_path) then
    return jsonb_build_object('success', false, 'error', 'Upload not found. Please try again.');
  end if;

  update public.jubah_bookings set linkme_path = p_path, linkme_uploaded_at = now() where id = v_b.id;

  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (null, coalesce(v_b.full_name, 'Customer') || ' (self-service)', 'customer', 'jubah_bookings', v_b.id::text,
          'upload_linkme_slip', jsonb_build_object('old_path', v_b.linkme_path, 'new_path', p_path));
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.customer_upload_jubah_linkme(text, text, text) from public;
grant execute on function public.customer_upload_jubah_linkme(text, text, text) to anon, authenticated;
