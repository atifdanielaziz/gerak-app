-- A negotiated quote becomes unavailable as soon as its IC is successfully
-- verified. The already-open client may continue to submit the booking, while
-- later attempts to open or verify the same link are rejected.
alter table public.jubah_custom_quotes
  add column if not exists claimed_at timestamptz;

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

  update public.jubah_custom_quotes
  set claimed_at = now()
  where id = v_quote.id;

  return jsonb_build_object(
    'success', true,
    'agreed_price', v_quote.agreed_price,
    'university_key', v_quote.university_key,
    'campus', v_quote.campus,
    'customer_phone', v_quote.customer_phone,
    'payment_mode', v_quote.payment_mode,
    'deposit_method', v_quote.deposit_method,
    'postage_zone', v_quote.postage_zone,
    'expires_at', v_quote.expires_at
  );
end;
$$;

revoke all on function public.resolve_jubah_custom_quote(text,text) from public;
grant execute on function public.resolve_jubah_custom_quote(text,text) to anon, authenticated;

