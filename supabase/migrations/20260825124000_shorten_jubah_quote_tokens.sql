-- New quote links use a compact 96-bit random token. Existing longer tokens
-- remain valid because the resolve/booking RPCs hash whatever token is given.
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
set search_path to 'public', 'extensions'
as $$
declare
  v_role text := public.get_my_role();
  v_token text := encode(extensions.gen_random_bytes(12), 'hex');
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

  select coalesce(nullif(value, '')::numeric, 25) into v_deposit
  from public.app_settings where key = 'jubah_deposit_amount';
  if p_payment_mode = 'deposit' and v_price <= coalesce(v_deposit, 25) then return jsonb_build_object('success', false, 'error', 'For this agreed price, use Full Payment to avoid an excessive deposit.'); end if;
  select count(*) into v_recent_count from public.jubah_custom_quotes
  where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.'); end if;

  insert into public.jubah_custom_quotes (
    token_hash, ic_hash, customer_phone, agreed_price, university_key, campus,
    payment_mode, deposit_method, postage_zone, created_by
  ) values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_ic, 'sha256'), 'hex'),
    v_phone, v_price, p_university_key, p_campus, p_payment_mode,
    case when p_payment_mode = 'deposit' then p_deposit_method else null end,
    case when p_payment_mode = 'postage' or (p_payment_mode = 'deposit' and p_deposit_method = 'postage') then p_postage_zone else null end,
    auth.uid()
  );
  return jsonb_build_object('success', true, 'token', v_token, 'expires_at', now() + interval '48 hours');
exception when others then
  raise warning 'create_jubah_custom_quote failed [%]: %', sqlstate, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not create the quote. Please try again.');
end;
$$;

revoke all on function public.create_jubah_custom_quote(text,text,numeric,text,text,text,text,text) from public, anon;
grant execute on function public.create_jubah_custom_quote(text,text,numeric,text,text,text,text,text) to authenticated;
