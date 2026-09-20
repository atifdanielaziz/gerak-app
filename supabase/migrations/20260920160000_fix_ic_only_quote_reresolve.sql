-- resolve_jubah_custom_quote_by_ic required claimed_at is null, same as
-- the token-based resolve_jubah_custom_quote — but that gate exists there
-- to stop the SAME public link being replayed against many guessed ICs.
-- This path has no link to replay; check_jubah_rate_limit() is already
-- its anti-abuse control. The claimed_at gate here just meant any second
-- lookup (a retry, a re-test, onBlur firing twice) permanently failed
-- with "no active quote found" even though nothing was ever actually
-- consumed (used_at still null) -- confirmed live: exactly this, twice.
--
-- Still sets claimed_at for observability, just no longer gates on it.

create or replace function public.resolve_jubah_custom_quote_by_ic(p_ic_number text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_quote public.jubah_custom_quotes%rowtype;
  v_rider_name text;
begin
  perform public.check_jubah_rate_limit();

  select * into v_quote
  from public.jubah_custom_quotes
  where ic_hash = encode(extensions.digest(regexp_replace(coalesce(p_ic_number, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex')
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'No active quote found for this IC number.');
  end if;

  update public.jubah_custom_quotes
  set claimed_at = coalesce(claimed_at, now())
  where id = v_quote.id;

  select name into v_rider_name from public.profiles where id = v_quote.created_by;

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'customer_phone', v_quote.customer_phone,
    'rider_id', v_quote.created_by,
    'rider_name', v_rider_name,
    'expires_at', v_quote.expires_at
  );
end;
$$;
