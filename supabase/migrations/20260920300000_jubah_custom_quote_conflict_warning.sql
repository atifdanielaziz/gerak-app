-- Nothing previously stopped a customer from being quoted by several riders
-- at once (each quote is an independent row, own token, own used_at) — a
-- customer who typed their IC into the general form would silently resolve
-- to whichever rider's quote was created most recently, with no sign the
-- others existed. This adds a soft warning: creating a quote for an IC that
-- already has another active (unused, unrevoked, unexpired) quote now
-- returns a distinct 'existing_quote' error instead of proceeding, naming
-- who already quoted them and for how much, so the rider can check with the
-- customer before generating a second link. Passing p_confirm_override=true
-- (a deliberate "create anyway" click) bypasses the warning and creates the
-- quote as before — this is advisory, not a hard block, since a customer
-- legitimately comparing prices from two riders is a real scenario.

-- Adding p_confirm_override changes the argument list, which Postgres treats
-- as a distinct overload rather than a replacement of the 4-arg version —
-- the same trap hit earlier in 20260825130000_drop_old_quote_overload.sql.
-- Drop the old signature explicitly so PostgREST has exactly one candidate.
drop function if exists public.create_jubah_custom_quote(text, numeric, text, text);

create or replace function public.create_jubah_custom_quote(
  p_ic_number text,
  p_agreed_price numeric,
  p_customer_phone text,
  p_campus text default null,
  p_confirm_override boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_role text := public.get_my_role();
  v_can_robe boolean := coalesce((select can_robe from public.profiles where id = auth.uid()), false);
  v_token text := encode(extensions.gen_random_bytes(12), 'hex');
  v_ic text := regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g');
  v_ic_hash text;
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_price numeric := round(p_agreed_price, 2);
  v_campus text := nullif(trim(coalesce(p_campus, '')), '');
  v_recent_count integer;
  v_existing record;
begin
  if auth.uid() is null or not (v_role in ('admin', 'superadmin') or v_can_robe) then
    return jsonb_build_object('success', false, 'error', 'Runner access required.');
  end if;
  if length(v_ic) <> 12 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid 12-digit IC number.');
  end if;
  if length(v_phone) < 9 or length(v_phone) > 12 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid customer phone number.');
  end if;
  if v_price is null or v_price <= 0 or v_price > 10000 then
    return jsonb_build_object('success', false, 'error', 'Enter an agreed price between RM0.01 and RM10,000.');
  end if;
  -- Only trust a campus this rider is actually assigned to — otherwise a
  -- quote could resolve to a campus/method the customer has no real rider
  -- for.
  if v_campus is not null and not exists (
    select 1 from public.jubah_rider_assignments
    where rider_id = auth.uid() and campus = v_campus and is_active = true
  ) then
    return jsonb_build_object('success', false, 'error', 'You are not assigned to that campus.');
  end if;
  select count(*) into v_recent_count from public.jubah_custom_quotes
  where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if v_recent_count >= 30 then
    return jsonb_build_object('success', false, 'error', 'Too many quotes created. Please try again later.');
  end if;

  v_ic_hash := encode(extensions.digest(v_ic, 'sha256'), 'hex');

  if not p_confirm_override then
    select jcq.created_by, coalesce(p.name, 'another rider') as rider_name, jcq.agreed_price, jcq.created_at
      into v_existing
      from public.jubah_custom_quotes jcq
      left join public.profiles p on p.id = jcq.created_by
      where jcq.ic_hash = v_ic_hash
        and jcq.used_at is null
        and jcq.revoked_at is null
        and jcq.expires_at > now()
      order by jcq.created_at desc
      limit 1;

    if v_existing.created_by is not null then
      return jsonb_build_object(
        'success', false,
        'error_code', 'existing_quote',
        'error', format(
          'This customer already has an active quote (RM%s) from %s.',
          trim(to_char(v_existing.agreed_price, 'FM999999990.00')),
          case when v_existing.created_by = auth.uid() then 'you' else v_existing.rider_name end
        ),
        'existing_rider_name', case when v_existing.created_by = auth.uid() then 'you' else v_existing.rider_name end,
        'existing_price', v_existing.agreed_price,
        'existing_created_at', v_existing.created_at
      );
    end if;
  end if;

  insert into public.jubah_custom_quotes (token_hash, ic_hash, agreed_price, customer_phone, campus, created_by)
  values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_ic_hash,
    v_price,
    p_customer_phone,
    v_campus,
    auth.uid()
  );
  return jsonb_build_object('success', true, 'token', v_token, 'expires_at', now() + interval '48 hours');
exception when others then
  raise warning 'create_jubah_custom_quote failed [%]: %', sqlstate, sqlerrm;
  return jsonb_build_object('success', false, 'error', 'Could not create the quote. Please try again.');
end;
$$;
