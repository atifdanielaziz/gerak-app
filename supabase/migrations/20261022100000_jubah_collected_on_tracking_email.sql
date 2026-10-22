-- ============================================================
-- Migration: Mark a postage booking Collected when its tracking is emailed
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Owner's choice (option A): when superadmin sends the J&T tracking email,
-- the robe has been collected and posted, so the booking moves straight to
-- 'collected' instead of staff stepping ~85 bookings through Processing by
-- hand. Skipping Processing would skip the rider commission stamp that
-- update_jubah_booking_status does there, so it is stamped here the same
-- way (only if not already stamped). Bookings already at collected or
-- delivered are left alone; a deposit with an unpaid balance is never
-- advanced (same rule as update_jubah_booking_status).
-- Called only by the send-jubah-tracking-emails edge function (service role).

create or replace function public.jubah_mark_collected_after_tracking(p_booking_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_b public.jubah_bookings;
  v_type text;
  v_amount numeric;
begin
  select * into v_b from public.jubah_bookings where id = p_booking_id;
  if v_b.id is null or v_b.status not in ('paid', 'processing') then
    return jsonb_build_object('success', true, 'changed', false);
  end if;
  if v_b.payment_mode = 'deposit' and not coalesce(v_b.balance_paid, false) then
    return jsonb_build_object('success', true, 'changed', false, 'reason', 'balance unpaid');
  end if;

  if v_b.rider_id is not null and v_b.rider_commission_amount is null then
    v_type := case when (v_b.payment_mode = 'postage' or (v_b.payment_mode = 'deposit' and v_b.delivery_address is not null))
                   then 'postage' else 'pickup' end;
    select coalesce(amount, 0) into v_amount from public.jubah_rider_commission
     where delivery_type = v_type and university = v_b.university_key;
    update public.jubah_bookings
       set status = 'collected', rider_commission_rate = null,
           rider_commission_amount = coalesce(v_amount, 0), rider_commission_earned_at = now()
     where id = p_booking_id;
  else
    update public.jubah_bookings set status = 'collected' where id = p_booking_id;
  end if;

  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (null, 'System (tracking email)', 'system', 'jubah_bookings', p_booking_id::text, 'update',
          jsonb_build_object('status', jsonb_build_object('old', v_b.status, 'new', 'collected'),
                             'note', 'J&T tracking emailed to customer'));
  return jsonb_build_object('success', true, 'changed', true);
end;
$$;
revoke all on function public.jubah_mark_collected_after_tracking(uuid) from public, anon, authenticated;
grant execute on function public.jubah_mark_collected_after_tracking(uuid) to service_role;
