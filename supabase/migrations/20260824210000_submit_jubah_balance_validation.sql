-- ============================================================
-- Validate the balance-proof path + add generic error handling to
-- submit_jubah_balance
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- p_balance_proof_url was inserted with zero server-side validation —
-- any string, any length, was accepted and stored as-is. The client
-- (JubahBalancePayment.tsx) always uploads to `{reference}/...` inside
-- the jubah-docs bucket, so a path that doesn't start with the booking's
-- own reference can't be a real upload for this booking — reject it
-- rather than silently store it, same "the path must match what the
-- client actually writes" check already used on provider_payment_details'
-- qr_path. Also adds the same generic-error wrapper already applied to
-- the other Jubah RPCs this pass.

create or replace function public.submit_jubah_balance(p_reference text, p_hp_number text, p_balance_proof_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  perform public.check_jubah_rate_limit();

  if p_balance_proof_url is null
     or length(p_balance_proof_url) = 0
     or length(p_balance_proof_url) > 300
     or left(p_balance_proof_url, length(p_reference) + 1) <> (p_reference || '/')
  then
    return jsonb_build_object('success', false, 'error', 'Invalid proof of payment. Please try uploading again.');
  end if;

  select id into v_id
  from   public.jubah_bookings
  where  reference    = p_reference
    and  hp_number    = p_hp_number
    and  payment_mode = 'deposit'
    and  balance_paid = false
  limit 1;

  if v_id is null then
    return jsonb_build_object('success', false, 'error', 'Booking not found or already paid.');
  end if;

  update public.jubah_bookings
     set balance_proof_url    = p_balance_proof_url,
         balance_submitted_at = now()
   where id = v_id;

  return jsonb_build_object('success', true);
exception when others then
  raise warning 'submit_jubah_balance failed: % (sqlstate %)', sqlerrm, sqlstate;
  return jsonb_build_object('success', false, 'error', 'Something went wrong submitting your payment proof. Please try again.');
end;
$$;
