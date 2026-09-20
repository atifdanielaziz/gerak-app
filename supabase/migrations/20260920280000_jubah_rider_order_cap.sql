-- Per-rider, per-university order cap for Jubah — once a rider's order
-- count for a university reaches the cap, they stop appearing as an
-- eligible rider there (customer dropdown + public directory), and a
-- final server-side check rejects the booking outright if two customers
-- both grab the last slot at the same moment. Resets between convocation
-- seasons via jubah_season_started_at, a movable line rather than an
-- actual data wipe — only bookings created on or after it count, so
-- starting a new season is just moving that line forward, and old
-- bookings/receipts are never touched.
--
-- Both values are plain app_settings rows so they're changeable without a
-- deploy, same as jubah_deposit_amount already is. Cap defaults to 45; not
-- confirmed as final by the admin yet, deliberately easy to revise.

insert into public.app_settings (key, value) values
  ('jubah_rider_order_cap', '45'),
  ('jubah_season_started_at', now()::text)
on conflict (key) do nothing;

-- Mirrors src/lib/universities.ts's campus lists — no shared source of
-- truth between TS and SQL today (see jubah_bookings' own university_key
-- check constraint, which duplicates the same key list already).
create or replace function public.jubah_university_key_from_campus(p_campus text)
returns text
language sql
immutable
as $$
  select case
    when p_campus in ('Pekan', 'Gambang') then 'umpsa'
    when p_campus in ('Shah Alam', 'Puncak Alam', 'Machang') then 'uitm'
    when p_campus in ('Jeli', 'Bachok', 'Kota Bharu') then 'umk'
    when p_campus = 'Bangi' then 'ukm'
    when p_campus in ('Gombak', 'Kuantan') then 'uiam'
    when p_campus = 'Sintok' then 'uum'
    when p_campus in ('Gong Badak', 'Medical', 'Besut') then 'unisza'
    when p_campus = 'Seri Iskandar' then 'utp'
    when p_campus in ('Serdang', 'Sarawak') then 'upm'
    when p_campus = 'Kuala Lumpur' then 'um'
    when p_campus in ('KSAJS', 'KSAS') then 'upsi'
    when p_campus in ('Kota Kinabalu', 'Labuan International', 'Sandakan') then 'ums'
    when p_campus in ('Barat', 'Timur', 'Bandar') then 'unimas'
    else null
  end;
$$;

create or replace function public.jubah_rider_order_cap()
returns integer
language sql
stable
as $$
  select coalesce((select value from public.app_settings where key = 'jubah_rider_order_cap')::integer, 45);
$$;

-- Cancelled bookings don't count — the rider never actually did the work,
-- so they shouldn't cost a slot. Only counts from the current season
-- onward (see header comment).
create or replace function public.jubah_rider_order_count(p_rider_id uuid, p_university_key text)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.jubah_bookings
  where rider_id = p_rider_id
    and university_key = p_university_key
    and status <> 'cancelled'
    and created_at >= coalesce((select value::timestamptz from public.app_settings where key = 'jubah_season_started_at'), '-infinity'::timestamptz);
$$;

create or replace function public.set_jubah_rider_order_cap(p_cap integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  if p_cap is null or p_cap < 1 or p_cap > 10000 then
    return jsonb_build_object('success', false, 'error', 'Enter a cap between 1 and 10,000.');
  end if;
  insert into public.app_settings (key, value) values ('jubah_rider_order_cap', p_cap::text)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('success', true, 'cap', p_cap);
end;
$$;

-- No parameter — starting a new season always means "from right now", so
-- there's nothing to accidentally mistype or backdate.
create or replace function public.start_new_jubah_season()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  insert into public.app_settings (key, value) values ('jubah_season_started_at', now()::text)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('success', true, 'started_at', now());
end;
$$;

revoke all on function public.set_jubah_rider_order_cap(integer) from public, anon;
grant execute on function public.set_jubah_rider_order_cap(integer) to authenticated;
revoke all on function public.start_new_jubah_season() from public, anon;
grant execute on function public.start_new_jubah_season() to authenticated;

-- ── Enforce the cap in every rider-matching query ──────────────────────

create or replace function public.get_active_jubah_riders(p_campus text, p_method text)
returns table (id uuid, name text, jubah_drop_point text, ic_number text, phone text)
language sql stable security definer
set search_path to 'public'
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
  where ja.campus    = any(public.jubah_campus_match_group(p_campus))
    and ja.method    = p_method
    and ja.is_active = true
    and p.role       in ('rider', 'driver', 'admin', 'superadmin')
    and p.can_robe   = true
    and p.status     = 'active'
    and public.jubah_rider_order_count(p.id, public.jubah_university_key_from_campus(p_campus)) < public.jubah_rider_order_cap()
  order by p.name;
$$;

create or replace function public.get_jubah_riders_directory_v2(p_campuses text[])
returns table (id uuid, name text, drop_point text, method text, ic_number text, phone text)
language sql stable security definer
set search_path to 'public'
as $$
  select
    ja.id,
    p.name,
    ja.drop_point,
    ja.method,
    p.ic_number,
    p.phone
  from public.jubah_rider_assignments ja
  join public.profiles p on p.id = ja.rider_id
  where ja.campus    = any(p_campuses)
    and ja.is_active = true
    and p.role       in ('rider', 'driver', 'admin', 'superadmin')
    and p.can_robe   = true
    and p.status     = 'active'
    and public.jubah_rider_order_count(p.id, public.jubah_university_key_from_campus(ja.campus)) < public.jubah_rider_order_cap()
  order by ja.created_at;
$$;

-- ── Final server-side re-check at booking-creation time ────────────────
-- The dropdown/directory queries above already exclude a capped rider, but
-- two customers can both load that list a moment apart and both pick the
-- same last-available rider before either submits. This re-checks at the
-- actual insert, so the second one to land is rejected instead of quietly
-- pushing that rider over the cap.

create or replace function public.create_jubah_booking(p_reference text, p_full_name text, p_ic_number text, p_hp_number text, p_matric_id text, p_university text, p_campus text, p_faculty text, p_remark text, p_payment_mode text, p_deposit_method text DEFAULT NULL::text, p_postage_zone text DEFAULT NULL::text, p_rider_id text DEFAULT NULL::text, p_rider_name text DEFAULT NULL::text, p_delivery_address text DEFAULT NULL::text, p_docs_path text DEFAULT NULL::text, p_payment_path text DEFAULT NULL::text, p_oscar_path text DEFAULT NULL::text, p_skpg_path text DEFAULT NULL::text, p_konvo_path text DEFAULT NULL::text, p_ic_path text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid, p_university_key text DEFAULT 'umpsa'::text, p_email text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_recent_count integer;
  v_pickup_price numeric;
  v_postage_price numeric;
  v_ss_charge numeric := 0;
  v_cost numeric;
  v_balance_due numeric := 0;
  v_deposit_amount numeric := 25;
  v_target_price numeric;
  v_rider_id uuid;
begin
  if p_full_name is null or length(trim(p_full_name)) = 0 or length(p_full_name) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid full name.');
  end if;
  if p_ic_number is null or p_ic_number !~ '^[0-9-]{8,14}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid IC number.');
  end if;
  if p_hp_number is null or p_hp_number !~ '^[0-9-]{8,15}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid phone number.');
  end if;
  if p_matric_id is null or length(trim(p_matric_id)) = 0 or length(p_matric_id) > 30 then
    return jsonb_build_object('success', false, 'error', 'Invalid matric ID.');
  end if;

  -- New: a matric ID already on file under a different IC number is
  -- rejected outright, rather than silently accepted as another row.
  if exists (
    select 1 from public.jubah_bookings
    where upper(matric_id) = upper(p_matric_id)
      and ic_number <> p_ic_number
  ) then
    return jsonb_build_object('success', false, 'error', 'This Matric ID is already registered under a different IC number. Please double-check your Matric ID and IC number.');
  end if;

  if p_university is null or length(p_university) = 0 or length(p_university) > 150 then
    return jsonb_build_object('success', false, 'error', 'Invalid university.');
  end if;
  if p_campus is null or length(p_campus) = 0 or length(p_campus) > 50 then
    return jsonb_build_object('success', false, 'error', 'Invalid campus.');
  end if;
  if p_faculty is null or length(trim(p_faculty)) = 0 or length(p_faculty) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid faculty.');
  end if;
  if p_remark is null or length(trim(p_remark)) = 0 or length(p_remark) > 100 then
    return jsonb_build_object('success', false, 'error', 'Invalid robe type.');
  end if;
  if p_email is not null and p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('success', false, 'error', 'Invalid email address.');
  end if;
  if p_email is not null and length(p_email) > 254 then
    return jsonb_build_object('success', false, 'error', 'Invalid email address.');
  end if;
  if p_delivery_address is not null and length(p_delivery_address) > 500 then
    return jsonb_build_object('success', false, 'error', 'Delivery address too long.');
  end if;
  if p_university_key is null or p_university_key not in ('umpsa', 'uitm', 'umk', 'ukm', 'uiam', 'uum', 'unisza', 'utp', 'upm', 'um', 'upsi', 'ums', 'unimas') then
    return jsonb_build_object('success', false, 'error', 'Invalid university.');
  end if;

  select count(*) into v_recent_count from public.jubah_bookings
  where created_at > now() - interval '10 minutes'
    and (hp_number = p_hp_number or matric_id = p_matric_id);
  if v_recent_count >= 3 then
    return jsonb_build_object('success', false, 'error', 'Too many bookings from this number, please wait a few minutes.');
  end if;

  begin v_rider_id := nullif(p_rider_id, '')::uuid; exception when others then v_rider_id := null; end;
  if v_rider_id is not null and public.jubah_rider_order_count(v_rider_id, p_university_key) >= public.jubah_rider_order_cap() then
    return jsonb_build_object('success', false, 'error', 'This rider has reached their order limit for this university. Please select another rider.');
  end if;

  select price into v_pickup_price from public.jubah_pricing
  where remark = p_remark and payment_mode = 'pickup' and university = p_university_key;
  select price into v_postage_price from public.jubah_pricing
  where remark = p_remark and payment_mode = 'postage' and university = p_university_key;
  if v_pickup_price is null or v_postage_price is null then
    return jsonb_build_object('success', false, 'error', 'Pricing not configured for this option.');
  end if;

  select coalesce(nullif(value, '')::numeric, 25) into v_deposit_amount
  from public.app_settings where key = 'jubah_deposit_amount';
  v_deposit_amount := coalesce(v_deposit_amount, 25);
  if p_postage_zone = 'SS' then v_ss_charge := 10; end if;

  if p_payment_mode = 'deposit' then
    v_target_price := case when p_deposit_method = 'postage' then v_postage_price + v_ss_charge else v_pickup_price end;
    if v_deposit_amount > v_target_price then
      return jsonb_build_object('success', false, 'error', 'The configured deposit exceeds this booking price. Please contact admin.');
    end if;
    v_cost := v_deposit_amount;
    v_balance_due := v_target_price - v_deposit_amount;
  elsif p_payment_mode = 'postage' then
    v_cost := v_postage_price + v_ss_charge;
  elsif p_payment_mode = 'pickup' then
    v_cost := v_pickup_price;
  else
    return jsonb_build_object('success', false, 'error', 'Invalid payment mode.');
  end if;

  insert into public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id,
    university, university_key, campus, faculty, remark,
    payment_mode, cost, balance_due, status,
    rider_id, rider_name, delivery_address,
    docs_path, payment_path, oscar_path, skpg_path, konvo_path, ic_path,
    customer_id, email
  ) values (
    p_reference, p_full_name, p_ic_number, p_hp_number, p_matric_id,
    p_university, p_university_key, p_campus, p_faculty, p_remark,
    p_payment_mode, v_cost, v_balance_due, 'ordered',
    v_rider_id, p_rider_name, p_delivery_address,
    p_docs_path, p_payment_path, p_oscar_path, p_skpg_path, p_konvo_path, p_ic_path,
    p_customer_id, p_email
  );
  return jsonb_build_object('success', true, 'reference', p_reference, 'cost', v_cost, 'balance_due', v_balance_due);
exception when others then
  raise warning 'create_jubah_booking failed: % (sqlstate %)', sqlerrm, sqlstate;
  if sqlstate = '23505' then
    return jsonb_build_object('success', false, 'error', 'This reference number is already in use — please try again.', 'code', 'duplicate_reference');
  end if;
  return jsonb_build_object('success', false, 'error', 'Something went wrong saving your booking. Please try again, or contact admin if this keeps happening.');
end;
$function$;

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
  v_university_key text := coalesce(nullif(p_booking->>'university_key',''), 'umpsa');
  v_deposit numeric := 25;
  v_cost numeric;
  v_balance numeric := 0;
  v_rider uuid;
  v_recent_count integer;
begin
  if p_token is not null and p_token <> '' then
    select * into q from public.jubah_custom_quotes
     where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       and ic_hash = encode(extensions.digest(v_ic, 'sha256'), 'hex')
       and used_at is null and revoked_at is null and expires_at > now()
     for update;
  else
    select * into q from public.jubah_custom_quotes
     where ic_hash = encode(extensions.digest(v_ic, 'sha256'), 'hex')
       and used_at is null and revoked_at is null and expires_at > now()
     order by created_at desc
     limit 1
     for update;
  end if;
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
       and a.campus = any(public.jubah_campus_match_group(p_booking->>'campus'))
  ) then return jsonb_build_object('success', false, 'error', 'The selected rider is no longer available.'); end if;

  if public.jubah_rider_order_count(v_rider, v_university_key) >= public.jubah_rider_order_cap() then
    return jsonb_build_object('success', false, 'error', 'This rider has reached their order limit for this university. Please select another rider.');
  end if;

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
    p_booking->>'matric_id', p_booking->>'university', v_university_key, p_booking->>'campus',
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
