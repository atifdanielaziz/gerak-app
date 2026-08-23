-- Pin negotiated quotes to the runner-selected phone and campus. These
-- values are returned only after IC verification and are enforced again at
-- booking insertion, so disabled browser fields cannot be bypassed.
alter table public.jubah_custom_quotes add column if not exists customer_phone text;
alter table public.jubah_custom_quotes add column if not exists campus text;

create or replace function public.create_jubah_custom_quote(
  p_ic_number text,
  p_customer_phone text,
  p_agreed_price numeric,
  p_university_key text,
  p_campus text,
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
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_price numeric := round(p_agreed_price, 2);
  v_deposit numeric := 25;
  v_recent_count integer;
  v_valid_campus boolean := false;
begin
  if auth.uid() is null or v_role not in ('rider', 'admin', 'superadmin') then
    return jsonb_build_object('success', false, 'error', 'Runner access required.');
  end if;
  if length(v_ic) <> 12 then return jsonb_build_object('success', false, 'error', 'Enter a valid 12-digit IC number.'); end if;
  if length(v_phone) < 9 or length(v_phone) > 12 then return jsonb_build_object('success', false, 'error', 'Enter a valid customer phone number.'); end if;
  if v_price is null or v_price <= 0 or v_price > 10000 then return jsonb_build_object('success', false, 'error', 'Enter an agreed price between RM0.01 and RM10,000.'); end if;
  if p_university_key is null or p_university_key not in ('umpsa','uitm','umk','ukm','uiam','uum','unisza','utp','upm','um','upsi') then return jsonb_build_object('success', false, 'error', 'Invalid university.'); end if;

  v_valid_campus :=
    (p_university_key = 'umpsa' and p_campus in ('Pekan','Gambang')) or
    (p_university_key = 'uitm' and p_campus in ('Shah Alam','Puncak Alam','Machang')) or
    (p_university_key = 'umk' and p_campus in ('Jeli','Bachok','Kota Bharu')) or
    (p_university_key = 'ukm' and p_campus = 'Bangi') or
    (p_university_key = 'uiam' and p_campus in ('Gombak','Kuantan')) or
    (p_university_key = 'uum' and p_campus = 'Sintok') or
    (p_university_key = 'unisza' and p_campus in ('Gong Badak','Medical','Besut')) or
    (p_university_key = 'utp' and p_campus = 'Seri Iskandar') or
    (p_university_key = 'upm' and p_campus in ('Serdang','Sarawak')) or
    (p_university_key = 'um' and p_campus = 'Kuala Lumpur') or
    (p_university_key = 'upsi' and p_campus in ('KSAJS','KSAS'));
  if not v_valid_campus then return jsonb_build_object('success', false, 'error', 'Campus does not match the selected university.'); end if;
  if p_payment_mode is null or p_payment_mode not in ('deposit', 'pickup', 'postage') then return jsonb_build_object('success', false, 'error', 'Invalid service option.'); end if;
  if p_payment_mode = 'deposit' and (p_deposit_method is null or p_deposit_method not in ('pickup', 'postage')) then return jsonb_build_object('success', false, 'error', 'Choose the deposit fulfilment method.'); end if;
  if (p_payment_mode = 'postage' or (p_payment_mode = 'deposit' and p_deposit_method = 'postage')) and (p_postage_zone is null or p_postage_zone not in ('SM', 'SS')) then return jsonb_build_object('success', false, 'error', 'Choose SM or SS.'); end if;

  select coalesce(nullif(value, '')::numeric, 25) into v_deposit from public.app_settings where key = 'jubah_deposit_amount';
  if p_payment_mode = 'deposit' and v_price <= coalesce(v_deposit, 25) then return jsonb_build_object('success', false, 'error', 'For this agreed price, use Full Payment to avoid an excessive deposit.'); end if;
  select count(*) into v_recent_count from public.jubah_custom_quotes where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.'); end if;

  insert into public.jubah_custom_quotes (
    token_hash, ic_hash, customer_phone, agreed_price, university_key, campus,
    payment_mode, deposit_method, postage_zone, created_by
  ) values (
    encode(digest(v_token, 'sha256'), 'hex'), encode(digest(v_ic, 'sha256'), 'hex'),
    p_customer_phone, v_price, p_university_key, p_campus, p_payment_mode,
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
declare v_quote public.jubah_custom_quotes%rowtype;
begin
  select * into v_quote from public.jubah_custom_quotes
   where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and ic_hash = encode(digest(regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex')
     and used_at is null and revoked_at is null and expires_at > now();
  if not found then return jsonb_build_object('success', false, 'error', 'This quote is invalid, expired, already used, or does not match this IC number.'); end if;
  return jsonb_build_object(
    'success', true, 'agreed_price', v_quote.agreed_price,
    'university_key', v_quote.university_key, 'campus', v_quote.campus,
    'customer_phone', v_quote.customer_phone, 'payment_mode', v_quote.payment_mode,
    'deposit_method', v_quote.deposit_method, 'postage_zone', v_quote.postage_zone,
    'expires_at', v_quote.expires_at
  );
end;
$$;

create or replace function public.enforce_jubah_custom_quote_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare q public.jubah_custom_quotes%rowtype; v_name text;
begin
  if new.custom_quote_id is null then return new; end if;
  select * into q from public.jubah_custom_quotes where id = new.custom_quote_id;
  if not found or q.campus is null or q.customer_phone is null then raise exception 'Invalid custom quote'; end if;
  new.hp_number := q.customer_phone;
  new.campus := q.campus;
  v_name := case q.university_key
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
    when 'upsi' then 'Universiti Pendidikan Sultan Idris' end;
  if q.university_key in ('umpsa','uitm','umk','uiam','unisza','upm','upsi') then v_name := v_name || ' (' || q.campus || ')'; end if;
  new.university := v_name;
  new.university_key := q.university_key;
  return new;
end;
$$;

drop trigger if exists enforce_jubah_custom_quote_fields on public.jubah_bookings;
create trigger enforce_jubah_custom_quote_fields before insert or update
on public.jubah_bookings for each row execute function public.enforce_jubah_custom_quote_fields();

revoke all on function public.create_jubah_custom_quote(text,text,numeric,text,text,text,text,text) from public, anon;
grant execute on function public.create_jubah_custom_quote(text,text,numeric,text,text,text,text,text) to authenticated;
revoke all on function public.create_jubah_custom_quote(text,numeric,text,text,text,text) from authenticated;
