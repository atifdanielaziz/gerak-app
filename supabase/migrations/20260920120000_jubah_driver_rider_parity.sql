-- Extend the admin/superadmin-as-rider parity (20260920100000) to also
-- cover 'driver' -- a driver-role staff account with can_robe set should
-- be a real assignable Jubah rider too, same as admin already is. Staff
-- roles change over time (this exact case: an account demoted from admin
-- to driver via toggle_user_role), and the point of can_robe as an
-- independent capability flag is that it shouldn't matter which staff
-- role currently holds it.

create or replace function public.set_rider_jubah_assignment(p_user_id uuid, p_method text, p_drop_point text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_role text;
  v_campus      text;
  v_primary_id  uuid;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role not in ('admin', 'superadmin') then
    raise exception 'Unauthorised: admin or superadmin access required';
  end if;

  select campus into v_campus from public.profiles
  where id = p_user_id and role in ('rider', 'driver', 'admin', 'superadmin');
  if v_campus is null then
    raise exception 'Rider not found';
  end if;

  select id into v_primary_id
  from public.jubah_rider_assignments
  where rider_id = p_user_id and is_active = true
  order by created_at
  limit 1;

  if v_primary_id is not null then
    update public.jubah_rider_assignments
    set method = p_method, drop_point = p_drop_point
    where id = v_primary_id;
  else
    insert into public.jubah_rider_assignments (rider_id, method, drop_point, campus, is_active)
    values (p_user_id, p_method, p_drop_point, v_campus, true);
  end if;

  update public.profiles
  set jubah_method = p_method, jubah_drop_point = p_drop_point
  where id = p_user_id;
end;
$function$;

drop function if exists public.get_active_jubah_riders(text, text);
create or replace function public.get_active_jubah_riders(p_campus text, p_method text)
returns table (
  id uuid, name text, jubah_drop_point text, ic_number text, phone text
)
language sql
security definer
set search_path to 'public'
stable
as $$
  select
    p.id,
    p.name,
    ja.drop_point as jubah_drop_point,
    case
      when p.ic_number is null then null
      when length(regexp_replace(p.ic_number, '\D', '', 'g')) < 6 then null
      else substring(regexp_replace(p.ic_number, '\D', '', 'g') from 1 for 6) || '-XX-XXXX'
    end as ic_number,
    p.phone
  from public.jubah_rider_assignments ja
  join public.profiles p on p.id = ja.rider_id
  where ja.campus    = p_campus
    and ja.method    = p_method
    and ja.is_active = true
    and p.role       in ('rider', 'driver', 'admin', 'superadmin')
    and p.can_robe   = true
    and p.status     = 'active'
  order by p.name;
$$;

grant execute on function public.get_active_jubah_riders(text, text) to anon, authenticated;

create or replace function public.create_custom_jubah_booking(p_token text, p_booking jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  q public.jubah_custom_quotes%rowtype;
  v_ic text := regexp_replace(coalesce(p_booking->>'ic_number', ''), '[^0-9]', '', 'g');
  v_reference text := trim(coalesce(p_booking->>'reference', ''));
  v_payment_mode text := p_booking->>'payment_mode';
  v_deposit_method text := nullif(p_booking->>'deposit_method', '');
  v_deposit numeric := 25;
  v_cost numeric;
  v_balance numeric := 0;
  v_rider uuid;
  v_recent_count integer;
begin
  select * into q from public.jubah_custom_quotes
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and ic_hash = encode(extensions.digest(v_ic, 'sha256'), 'hex')
     and used_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then return jsonb_build_object('success', false, 'error', 'This custom quote is no longer available.'); end if;

  if length(v_reference) < 8 or length(v_reference) > 40 then return jsonb_build_object('success', false, 'error', 'Invalid booking reference.'); end if;
  if length(trim(coalesce(p_booking->>'full_name',''))) = 0 or length(p_booking->>'full_name') > 100 then return jsonb_build_object('success', false, 'error', 'Invalid full name.'); end if;
  if length(v_ic) <> 12 then return jsonb_build_object('success', false, 'error', 'Invalid IC number.'); end if;
  if coalesce(p_booking->>'hp_number','') !~ '^[0-9-]{8,15}$' then return jsonb_build_object('success', false, 'error', 'Invalid phone number.'); end if;
  if length(trim(coalesce(p_booking->>'matric_id',''))) = 0 or length(p_booking->>'matric_id') > 30 then return jsonb_build_object('success', false, 'error', 'Invalid matric ID.'); end if;
  if length(trim(coalesce(p_booking->>'campus',''))) = 0 or length(p_booking->>'campus') > 50 then return jsonb_build_object('success', false, 'error', 'Invalid campus.'); end if;
  if length(trim(coalesce(p_booking->>'faculty',''))) = 0 or length(p_booking->>'faculty') > 100 then return jsonb_build_object('success', false, 'error', 'Invalid faculty.'); end if;
  if coalesce(p_booking->>'remark','') not in ('Master','PHD','Degree','Diploma') then return jsonb_build_object('success', false, 'error', 'Invalid robe type.'); end if;
  if nullif(p_booking->>'email','') is not null and (length(p_booking->>'email') > 254 or p_booking->>'email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then return jsonb_build_object('success', false, 'error', 'Invalid email address.'); end if;
  if length(coalesce(p_booking->>'delivery_address','')) > 500 then return jsonb_build_object('success', false, 'error', 'Delivery address too long.'); end if;
  if p_booking->>'university' is null or length(p_booking->>'university') = 0 or length(p_booking->>'university') > 150 then return jsonb_build_object('success', false, 'error', 'Invalid university.'); end if;
  if v_payment_mode is null or v_payment_mode not in ('deposit', 'pickup', 'postage') then return jsonb_build_object('success', false, 'error', 'Invalid service option.'); end if;
  if v_payment_mode = 'deposit' and (v_deposit_method is null or v_deposit_method not in ('pickup', 'postage')) then return jsonb_build_object('success', false, 'error', 'Choose the deposit fulfilment method.'); end if;

  select count(*) into v_recent_count from public.jubah_bookings
   where created_at > now() - interval '10 minutes'
     and (hp_number = p_booking->>'hp_number' or matric_id = p_booking->>'matric_id');
  if v_recent_count >= 3 then return jsonb_build_object('success', false, 'error', 'Too many bookings from this number, please wait a few minutes.'); end if;

  begin v_rider := nullif(p_booking->>'rider_id','')::uuid; exception when others then return jsonb_build_object('success', false, 'error', 'Invalid rider.'); end;
  if v_rider is null or not exists (
    select 1 from public.profiles p join public.jubah_rider_assignments a on a.rider_id = p.id
     where p.id = v_rider and p.role in ('rider', 'driver', 'admin', 'superadmin')
       and p.status = 'active' and p.can_robe = true and a.is_active = true
       and a.method = case when v_payment_mode = 'deposit' then v_deposit_method else v_payment_mode end
       and a.campus = p_booking->>'campus'
  ) then return jsonb_build_object('success', false, 'error', 'The selected rider is no longer available.'); end if;

  if v_payment_mode = 'deposit' then
    select coalesce(nullif(value, '')::numeric, 25) into v_deposit from public.app_settings where key = 'jubah_deposit_amount';
    v_deposit := coalesce(v_deposit, 25);
    if v_deposit >= q.agreed_price then return jsonb_build_object('success', false, 'error', 'The deposit is no longer valid for this quote. Contact your runner.'); end if;
    v_cost := v_deposit; v_balance := q.agreed_price - v_deposit;
  else
    v_cost := q.agreed_price;
  end if;

  insert into public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id, university, university_key,
    campus, faculty, remark, payment_mode, cost, balance_due, status, rider_id,
    rider_name, delivery_address, docs_path, payment_path, oscar_path, skpg_path,
    konvo_path, ic_path, customer_id, email, custom_quote_id
  ) values (
    v_reference, upper(trim(p_booking->>'full_name')), p_booking->>'ic_number', p_booking->>'hp_number',
    p_booking->>'matric_id', p_booking->>'university', coalesce(nullif(p_booking->>'university_key',''), 'umpsa'), p_booking->>'campus',
    p_booking->>'faculty', p_booking->>'remark', v_payment_mode, v_cost, v_balance, 'ordered', v_rider,
    p_booking->>'rider_name', p_booking->>'delivery_address', p_booking->>'docs_path', p_booking->>'payment_path',
    p_booking->>'oscar_path', p_booking->>'skpg_path', p_booking->>'konvo_path', p_booking->>'ic_path',
    nullif(p_booking->>'customer_id','')::uuid, p_booking->>'email', q.id
  );
  update public.jubah_custom_quotes set used_at = now(), booking_reference = v_reference where id = q.id;
  return jsonb_build_object('success', true, 'reference', v_reference, 'cost', v_cost, 'balance_due', v_balance);
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'This reference number is already in use — please try again.', 'code', 'duplicate_reference');
when others then
  raise warning 'create_custom_jubah_booking failed: %', sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not save your booking. Please try again.');
end;
$$;

revoke all on function public.create_custom_jubah_booking(text, jsonb) from public;
grant execute on function public.create_custom_jubah_booking(text, jsonb) to anon, authenticated;
