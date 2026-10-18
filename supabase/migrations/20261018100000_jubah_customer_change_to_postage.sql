-- ============================================================
-- Migration: Customer switches a Jubah booking from Pickup to Postage
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Self-service from Track My Order, behind the same reference +
-- last-4-IC check and the same lock as document replace (Robe Status
-- 'ordered'/'paid' only). Decided by the owner: no extra charge (cost is
-- left as is) and the rider stays the same. The address is saved in the
-- booking form's format (Jubah.tsx fullAddress), with the
-- "[SS - Sabah & Sarawak]" prefix for East Malaysia, so the J&T dispatch
-- page and receipts read it like any other postage booking. Sabah &
-- Sarawak respects the superadmin switch (jubah_ss_postage_is_open).

create or replace function public.customer_change_jubah_to_postage(
  p_reference text, p_ic_last4 text,
  p_line1 text, p_line2 text, p_postcode text, p_city text, p_state text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_b record;
  v_state text := btrim(coalesce(p_state, ''));
  v_ss boolean;
  v_address text;
begin
  perform public.check_jubah_rate_limit();

  select id, status, full_name, ic_number, payment_mode, delivery_address
    into v_b from public.jubah_bookings where reference = p_reference;
  if v_b.id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found.');
  end if;
  if right(regexp_replace(coalesce(v_b.ic_number, ''), '\D', '', 'g'), 4) <> coalesce(p_ic_last4, '') then
    return jsonb_build_object('success', false, 'error', 'Incorrect IC digits.');
  end if;
  if v_b.status not in ('ordered', 'paid') then
    return jsonb_build_object('success', false, 'error', 'This order is already being processed and can no longer be changed.');
  end if;
  if not (v_b.payment_mode = 'pickup' or (v_b.payment_mode = 'deposit' and v_b.delivery_address is null)) then
    return jsonb_build_object('success', false, 'error', 'This booking is already set to postage.');
  end if;

  if coalesce(btrim(p_line1), '') = '' or coalesce(btrim(p_city), '') = '' or v_state = '' then
    return jsonb_build_object('success', false, 'error', 'Please fill in your address, city and state.');
  end if;
  if btrim(coalesce(p_postcode, '')) !~ '^\d{5}$' then
    return jsonb_build_object('success', false, 'error', 'Postcode must be 5 digits.');
  end if;
  if length(p_line1) > 150 or length(coalesce(p_line2, '')) > 150 or length(p_city) > 60 or length(v_state) > 60 then
    return jsonb_build_object('success', false, 'error', 'Address is too long.');
  end if;
  if v_state not in ('Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis',
                     'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
                     'Wilayah Persekutuan Kuala Lumpur', 'Wilayah Persekutuan Labuan', 'Wilayah Persekutuan Putrajaya') then
    return jsonb_build_object('success', false, 'error', 'Please choose a state from the list.');
  end if;

  v_ss := v_state in ('Sabah', 'Sarawak', 'Wilayah Persekutuan Labuan');
  if v_ss and not public.jubah_ss_postage_is_open() then
    return jsonb_build_object('success', false, 'error', 'Postage to Sabah & Sarawak is closed for now.');
  end if;

  v_address := concat_ws(E'\n',
    case when v_ss then '[SS - Sabah & Sarawak]' end,
    btrim(p_line1),
    nullif(btrim(coalesce(p_line2, '')), ''),
    btrim(p_postcode) || ' ' || btrim(p_city),
    v_state || ', Malaysia');

  update public.jubah_bookings
     set payment_mode = case when payment_mode = 'pickup' then 'postage' else payment_mode end,
         delivery_address = v_address
   where id = v_b.id;

  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (null, coalesce(v_b.full_name, 'Customer') || ' (self-service)', 'customer', 'jubah_bookings', v_b.id::text,
          'change_to_postage',
          jsonb_build_object('payment_mode', jsonb_build_object('old', v_b.payment_mode,
                               'new', case when v_b.payment_mode = 'pickup' then 'postage' else v_b.payment_mode end),
                             'delivery_address', jsonb_build_object('old', v_b.delivery_address, 'new', v_address)));

  return jsonb_build_object('success', true, 'delivery_address', v_address);
end;
$$;
revoke all on function public.customer_change_jubah_to_postage(text, text, text, text, text, text, text) from public;
grant execute on function public.customer_change_jubah_to_postage(text, text, text, text, text, text, text) to anon, authenticated;
