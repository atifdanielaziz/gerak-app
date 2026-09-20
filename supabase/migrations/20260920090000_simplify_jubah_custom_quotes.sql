-- Custom Jubah quotes used to fix the customer's phone, university, campus
-- AND service option up front — the runner had to know all of that before
-- issuing a link. Going forward a quote only fixes the agreed PRICE against
-- an IC number; the customer supplies everything else themselves through
-- the same link, exactly like a normal (non-quoted) booking. This keeps
-- pricing a WhatsApp negotiation without forcing the runner to fill in a
-- long form to get there.
--
-- The old columns (customer_phone, university_key, campus, payment_mode,
-- deposit_method, postage_zone) are left in place for historical quotes —
-- dropping them would lose the record of what old (already-used) quotes
-- actually locked in. New quotes simply never populate them.

alter table public.jubah_custom_quotes alter column university_key drop not null;
alter table public.jubah_custom_quotes alter column payment_mode drop not null;
alter table public.jubah_custom_quotes drop constraint if exists jubah_custom_quotes_deposit_method;
alter table public.jubah_custom_quotes drop constraint if exists jubah_custom_quotes_postage_zone;

-- The old field-enforcement trigger required campus/customer_phone to be
-- set on the quote (raising otherwise) — with those no longer populated,
-- every new custom booking would fail this check. Its whole job (forcing
-- quote-decided fields onto the booking row) is obsolete now that the
-- customer supplies those fields directly, validated in
-- create_custom_jubah_booking below like any other booking.
drop trigger if exists enforce_jubah_custom_quote_fields on public.jubah_bookings;
drop function if exists public.enforce_jubah_custom_quote_fields();

-- Old 8-arg signature is being replaced by a 2-arg one — a different arg
-- list creates a NEW overload rather than replacing in place, so the old
-- one must be dropped explicitly (this exact overload-collision class of
-- bug is what broke Jubah custom quotes earlier — see
-- migration_diag_quote_overloads cleanup).
drop function if exists public.create_jubah_custom_quote(text, text, numeric, text, text, text, text, text);

create or replace function public.create_jubah_custom_quote(
  p_ic_number text,
  p_agreed_price numeric
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
  v_price numeric := round(p_agreed_price, 2);
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
  select count(*) into v_recent_count from public.jubah_custom_quotes
  where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then
    return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.');
  end if;

  insert into public.jubah_custom_quotes (token_hash, ic_hash, agreed_price, created_by)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    encode(extensions.digest(v_ic, 'sha256'), 'hex'),
    v_price,
    auth.uid()
  );
  return jsonb_build_object('success', true, 'token', v_token, 'expires_at', now() + interval '48 hours');
exception when others then
  raise warning 'create_jubah_custom_quote failed [%]: %', sqlstate, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not create the quote. Please try again.');
end;
$$;

create or replace function public.resolve_jubah_custom_quote(p_token text, p_ic_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_quote public.jubah_custom_quotes%rowtype;
begin
  select * into v_quote
  from public.jubah_custom_quotes
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and ic_hash = encode(extensions.digest(regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex')
    and used_at is null
    and revoked_at is null
    and claimed_at is null
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'This quote is invalid, expired, already claimed, or does not match this IC number.'
    );
  end if;

  update public.jubah_custom_quotes set claimed_at = now() where id = v_quote.id;

  return jsonb_build_object('success', true, 'agreed_price', v_quote.agreed_price, 'expires_at', v_quote.expires_at);
end;
$$;

-- Now mirrors create_jubah_booking's trust model (client supplies its own
-- university/campus/payment_mode, same validation shape) — the ONLY thing
-- still server-derived from the quote is the price itself, so a tampered
-- request still can't pay less than what was agreed.
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
     where p.id = v_rider and p.role = 'rider' and p.status = 'active' and p.can_robe = true and a.is_active = true
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

revoke all on function public.create_jubah_custom_quote(text, numeric) from public, anon;
grant execute on function public.create_jubah_custom_quote(text, numeric) to authenticated;
revoke all on function public.resolve_jubah_custom_quote(text, text) from public;
grant execute on function public.resolve_jubah_custom_quote(text, text) to anon, authenticated;
revoke all on function public.create_custom_jubah_booking(text, jsonb) from public;
grant execute on function public.create_custom_jubah_booking(text, jsonb) to anon, authenticated;
