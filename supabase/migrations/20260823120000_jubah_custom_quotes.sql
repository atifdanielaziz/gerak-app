-- Negotiated Jubah quotes. The public link contains a random one-time token;
-- neither the customer's IC nor the agreed price is exposed in the URL.
create extension if not exists pgcrypto;

create table if not exists public.jubah_custom_quotes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  ic_hash text not null,
  agreed_price numeric(10,2) not null check (agreed_price > 0 and agreed_price <= 10000),
  university_key text not null,
  payment_mode text not null check (payment_mode in ('deposit', 'pickup', 'postage')),
  deposit_method text null check (deposit_method in ('pickup', 'postage')),
  postage_zone text null check (postage_zone in ('SM', 'SS')),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  used_at timestamptz,
  revoked_at timestamptz,
  booking_reference text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint jubah_custom_quotes_deposit_method check (
    (payment_mode = 'deposit' and deposit_method is not null)
    or (payment_mode <> 'deposit' and deposit_method is null)
  ),
  constraint jubah_custom_quotes_postage_zone check (
    (payment_mode = 'postage' and postage_zone is not null)
    or (payment_mode = 'deposit' and deposit_method = 'postage' and postage_zone is not null)
    or ((payment_mode = 'pickup' or deposit_method = 'pickup') and postage_zone is null)
  )
);

alter table public.jubah_custom_quotes enable row level security;
alter table public.jubah_bookings add column if not exists custom_quote_id uuid references public.jubah_custom_quotes(id);
create unique index if not exists jubah_custom_quotes_booking_reference_key
  on public.jubah_custom_quotes (booking_reference) where booking_reference is not null;

-- No direct table policy is intentional: even an IC hash is sensitive and
-- sufficiently enumerable. All quote access goes through the narrow RPCs.
drop policy if exists "quote creators can read quotes" on public.jubah_custom_quotes;

create or replace function public.create_jubah_custom_quote(
  p_ic_number text,
  p_agreed_price numeric,
  p_university_key text,
  p_payment_mode text,
  p_deposit_method text default null,
  p_postage_zone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_role text := public.get_my_role();
  v_token text := encode(gen_random_bytes(24), 'hex');
  v_ic text := regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g');
  v_price numeric := round(p_agreed_price, 2);
  v_deposit numeric := 25;
  v_recent_count integer;
begin
  if auth.uid() is null or v_role not in ('rider', 'admin', 'superadmin') then
    return jsonb_build_object('success', false, 'error', 'Runner access required.');
  end if;
  if length(v_ic) <> 12 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid 12-digit IC number.');
  end if;
  if v_price is null or v_price <= 0 or v_price > 10000 then
    return jsonb_build_object('success', false, 'error', 'Enter an agreed price between RM0.01 and RM10,000.');
  end if;
  if p_university_key is null or p_university_key not in ('umpsa','uitm','umk','ukm','uiam','uum','unisza','utp','upm','um','upsi') then
    return jsonb_build_object('success', false, 'error', 'Invalid university.');
  end if;
  if p_payment_mode is null or p_payment_mode not in ('deposit', 'pickup', 'postage') then
    return jsonb_build_object('success', false, 'error', 'Invalid service option.');
  end if;
  if p_payment_mode = 'deposit' and (p_deposit_method is null or p_deposit_method not in ('pickup', 'postage')) then
    return jsonb_build_object('success', false, 'error', 'Choose the deposit fulfilment method.');
  end if;
  if (p_payment_mode = 'postage' or (p_payment_mode = 'deposit' and p_deposit_method = 'postage'))
     and (p_postage_zone is null or p_postage_zone not in ('SM', 'SS')) then
    return jsonb_build_object('success', false, 'error', 'Choose SM or SS.');
  end if;
  select coalesce(nullif(value, '')::numeric, 25) into v_deposit
    from public.app_settings where key = 'jubah_deposit_amount';
  if p_payment_mode = 'deposit' and v_price <= coalesce(v_deposit, 25) then
    return jsonb_build_object('success', false, 'error', 'For this agreed price, use Full Payment to avoid an excessive deposit.');
  end if;
  select count(*) into v_recent_count from public.jubah_custom_quotes
   where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then
    return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.');
  end if;

  insert into public.jubah_custom_quotes (
    token_hash, ic_hash, agreed_price, university_key, payment_mode,
    deposit_method, postage_zone, created_by
  ) values (
    encode(digest(v_token, 'sha256'), 'hex'),
    encode(digest(v_ic, 'sha256'), 'hex'),
    v_price, p_university_key, p_payment_mode,
    case when p_payment_mode = 'deposit' then p_deposit_method else null end,
    case when p_payment_mode = 'postage' or (p_payment_mode = 'deposit' and p_deposit_method = 'postage') then p_postage_zone else null end,
    auth.uid()
  );

  return jsonb_build_object('success', true, 'token', v_token, 'expires_at', now() + interval '48 hours');
exception when others then
  raise warning 'create_jubah_custom_quote failed: %', sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not create the quote. Please try again.');
end;
$$;

create or replace function public.resolve_jubah_custom_quote(p_token text, p_ic_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quote public.jubah_custom_quotes%rowtype;
begin
  select * into v_quote from public.jubah_custom_quotes
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and ic_hash = encode(digest(regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex')
     and used_at is null and revoked_at is null and expires_at > now();
  if not found then
    return jsonb_build_object('success', false, 'error', 'This quote is invalid, expired, already used, or does not match this IC number.');
  end if;
  return jsonb_build_object(
    'success', true, 'agreed_price', v_quote.agreed_price,
    'university_key', v_quote.university_key, 'payment_mode', v_quote.payment_mode,
    'deposit_method', v_quote.deposit_method, 'postage_zone', v_quote.postage_zone,
    'expires_at', v_quote.expires_at
  );
end;
$$;

-- Dedicated atomic booking path: validates the quote and inserts the booking
-- before consuming it, so a quote cannot be replayed or client-price-tampered.
create or replace function public.create_custom_jubah_booking(p_token text, p_booking jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  q public.jubah_custom_quotes%rowtype;
  v_ic text := regexp_replace(coalesce(p_booking->>'ic_number', ''), '[^0-9]', '', 'g');
  v_reference text := trim(coalesce(p_booking->>'reference', ''));
  v_deposit numeric := 25;
  v_cost numeric;
  v_balance numeric := 0;
  v_rider uuid;
  v_recent_count integer;
  v_university text;
begin
  select * into q from public.jubah_custom_quotes
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and ic_hash = encode(digest(v_ic, 'sha256'), 'hex')
     and used_at is null and revoked_at is null and expires_at > now()
   for update;
  if not found then return jsonb_build_object('success', false, 'error', 'This custom quote is no longer available.'); end if;
  if q.university_key <> p_booking->>'university_key' then return jsonb_build_object('success', false, 'error', 'Quote university mismatch.'); end if;
  if length(v_reference) < 8 or length(v_reference) > 40 then return jsonb_build_object('success', false, 'error', 'Invalid booking reference.'); end if;
  if length(trim(coalesce(p_booking->>'full_name',''))) = 0 then return jsonb_build_object('success', false, 'error', 'Invalid full name.'); end if;
  if length(p_booking->>'full_name') > 100 then return jsonb_build_object('success', false, 'error', 'Invalid full name.'); end if;
  if length(v_ic) <> 12 then return jsonb_build_object('success', false, 'error', 'Invalid IC number.'); end if;
  if coalesce(p_booking->>'hp_number','') !~ '^[0-9-]{8,15}$' then return jsonb_build_object('success', false, 'error', 'Invalid phone number.'); end if;
  if length(trim(coalesce(p_booking->>'matric_id',''))) = 0 or length(p_booking->>'matric_id') > 30 then return jsonb_build_object('success', false, 'error', 'Invalid matric ID.'); end if;
  if length(trim(coalesce(p_booking->>'campus',''))) = 0 or length(p_booking->>'campus') > 50 then return jsonb_build_object('success', false, 'error', 'Invalid campus.'); end if;
  if length(trim(coalesce(p_booking->>'faculty',''))) = 0 or length(p_booking->>'faculty') > 100 then return jsonb_build_object('success', false, 'error', 'Invalid faculty.'); end if;
  if coalesce(p_booking->>'remark','') not in ('Master','PHD','Degree','Diploma') then return jsonb_build_object('success', false, 'error', 'Invalid robe type.'); end if;
  if nullif(p_booking->>'email','') is not null and (length(p_booking->>'email') > 254 or p_booking->>'email' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then return jsonb_build_object('success', false, 'error', 'Invalid email address.'); end if;
  if length(coalesce(p_booking->>'delivery_address','')) > 500 then return jsonb_build_object('success', false, 'error', 'Delivery address too long.'); end if;

  v_university := case q.university_key
    when 'umpsa' then 'Universiti Malaysia Pahang Al-Sultan Abdullah'
    when 'uitm' then 'Universiti Teknologi MARA'
    when 'umk' then 'Universiti Malaysia Kelantan'
    when 'ukm' then 'Universiti Kebangsaan Malaysia'
    when 'uiam' then 'Universiti Islam Antarabangsa Malaysia'
    when 'uum' then 'Universiti Utara Malaysia'
    when 'unisza' then 'Universiti Sultan Zainal Abidin'
    when 'utp' then 'Universiti Teknologi PETRONAS'
    when 'upm' then 'Universiti Putra Malaysia'
    when 'um' then 'Universiti Malaya'
    when 'upsi' then 'Universiti Pendidikan Sultan Idris'
  end;
  if not (
    (q.university_key = 'umpsa' and p_booking->>'campus' in ('Pekan','Gambang')) or
    (q.university_key = 'uitm' and p_booking->>'campus' in ('Shah Alam','Puncak Alam','Machang')) or
    (q.university_key = 'umk' and p_booking->>'campus' in ('Jeli','Bachok','Kota Bharu')) or
    (q.university_key = 'ukm' and p_booking->>'campus' = 'Bangi') or
    (q.university_key = 'uiam' and p_booking->>'campus' in ('Gombak','Kuantan')) or
    (q.university_key = 'uum' and p_booking->>'campus' = 'Sintok') or
    (q.university_key = 'unisza' and p_booking->>'campus' in ('Gong Badak','Medical','Besut')) or
    (q.university_key = 'utp' and p_booking->>'campus' = 'Seri Iskandar') or
    (q.university_key = 'upm' and p_booking->>'campus' in ('Serdang','Sarawak')) or
    (q.university_key = 'um' and p_booking->>'campus' = 'Kuala Lumpur') or
    (q.university_key = 'upsi' and p_booking->>'campus' in ('KSAJS','KSAS'))
  ) then return jsonb_build_object('success', false, 'error', 'Campus does not match this quote.'); end if;
  if q.university_key in ('umpsa','uitm','umk','uiam','unisza','upm','upsi') then
    v_university := v_university || ' (' || (p_booking->>'campus') || ')';
  end if;

  select count(*) into v_recent_count from public.jubah_bookings
   where created_at > now() - interval '10 minutes'
     and (hp_number = p_booking->>'hp_number' or matric_id = p_booking->>'matric_id');
  if v_recent_count >= 3 then return jsonb_build_object('success', false, 'error', 'Too many bookings from this number, please wait a few minutes.'); end if;

  begin v_rider := nullif(p_booking->>'rider_id','')::uuid; exception when others then return jsonb_build_object('success', false, 'error', 'Invalid rider.'); end;
  if v_rider is null or not exists (
    select 1 from public.profiles p join public.jubah_rider_assignments a on a.rider_id = p.id
     where p.id = v_rider and p.role = 'rider' and p.status = 'active' and p.can_robe = true and a.is_active = true
       and a.method = case when q.payment_mode = 'deposit' then q.deposit_method else q.payment_mode end
       and a.campus = p_booking->>'campus'
  ) then return jsonb_build_object('success', false, 'error', 'The selected rider is no longer available.'); end if;

  if q.payment_mode = 'deposit' then
    select coalesce(nullif(value, '')::numeric, 25) into v_deposit from public.app_settings where key = 'jubah_deposit_amount';
    v_deposit := coalesce(v_deposit, 25);
    if v_deposit >= q.agreed_price then return jsonb_build_object('success', false, 'error', 'The deposit is no longer valid for this quote. Contact your runner.'); end if;
    v_cost := v_deposit; v_balance := q.agreed_price - v_deposit;
  else v_cost := q.agreed_price;
  end if;

  insert into public.jubah_bookings (
    reference, full_name, ic_number, hp_number, matric_id, university, university_key,
    campus, faculty, remark, payment_mode, cost, balance_due, status, rider_id,
    rider_name, delivery_address, docs_path, payment_path, oscar_path, skpg_path,
    konvo_path, ic_path, customer_id, email, custom_quote_id
  ) values (
    v_reference, upper(trim(p_booking->>'full_name')), p_booking->>'ic_number', p_booking->>'hp_number',
    p_booking->>'matric_id', v_university, q.university_key, p_booking->>'campus',
    p_booking->>'faculty', p_booking->>'remark', q.payment_mode, v_cost, v_balance, 'ordered', v_rider,
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

revoke all on function public.create_jubah_custom_quote(text,numeric,text,text,text,text) from public, anon;
grant execute on function public.create_jubah_custom_quote(text,numeric,text,text,text,text) to authenticated;
revoke all on function public.resolve_jubah_custom_quote(text,text) from public;
grant execute on function public.resolve_jubah_custom_quote(text,text) to anon, authenticated;
revoke all on function public.create_custom_jubah_booking(text,jsonb) from public;
grant execute on function public.create_custom_jubah_booking(text,jsonb) to anon, authenticated;
