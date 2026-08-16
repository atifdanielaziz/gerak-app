-- Provider-owned payment directory and feedback inbox.
create table if not exists public.provider_payment_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  bank_name text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  qr_path text,
  updated_at timestamptz not null default now()
);

alter table public.provider_payment_details enable row level security;

create policy "provider_payment_details_self_select"
  on public.provider_payment_details for select to authenticated
  using (user_id = auth.uid());

create or replace function public.get_my_provider_payment_details()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_row public.provider_payment_details%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('success', false, 'error', 'Authentication required.'); end if;
  select * into v_row from public.provider_payment_details where user_id = auth.uid();
  return jsonb_build_object(
    'success', true,
    'bank_name', coalesce(v_row.bank_name, ''),
    'account_number', coalesce(v_row.account_number, ''),
    'account_holder', coalesce(v_row.account_holder, ''),
    'qr_path', v_row.qr_path
  );
end;
$$;

create or replace function public.set_my_provider_payment_details(
  p_bank_name text, p_account_number text, p_account_holder text, p_qr_path text default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role in ('driver', 'rider') or can_drive or can_rent or can_transport)
  ) then
    return jsonb_build_object('success', false, 'error', 'Service providers only.');
  end if;
  if coalesce(trim(p_bank_name), '') = '' or length(p_bank_name) > 100 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid bank name.');
  end if;
  if coalesce(trim(p_account_number), '') = '' or length(p_account_number) > 50 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid account number.');
  end if;
  if coalesce(trim(p_account_holder), '') = '' or length(p_account_holder) > 100 then
    return jsonb_build_object('success', false, 'error', 'Enter a valid account holder.');
  end if;
  if p_qr_path is not null and p_qr_path <> (auth.uid()::text || '/qr') then
    return jsonb_build_object('success', false, 'error', 'Invalid QR path.');
  end if;

  insert into public.provider_payment_details (user_id, bank_name, account_number, account_holder, qr_path)
  values (auth.uid(), trim(p_bank_name), trim(p_account_number), trim(p_account_holder), p_qr_path)
  on conflict (user_id) do update set
    bank_name = excluded.bank_name,
    account_number = excluded.account_number,
    account_holder = excluded.account_holder,
    qr_path = coalesce(excluded.qr_path, provider_payment_details.qr_path),
    updated_at = now();
  return jsonb_build_object('success', true, 'qr_path', coalesce(p_qr_path, (select qr_path from public.provider_payment_details where user_id = auth.uid())));
end;
$$;

revoke all on function public.get_my_provider_payment_details() from public, anon;
revoke all on function public.set_my_provider_payment_details(text, text, text, text) from public, anon;
grant execute on function public.get_my_provider_payment_details() to authenticated;
grant execute on function public.set_my_provider_payment_details(text, text, text, text) to authenticated;

create or replace function public.set_my_provider_qr_path(p_qr_path text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role in ('driver', 'rider') or can_drive or can_rent or can_transport)
  ) then
    return jsonb_build_object('success', false, 'error', 'Service providers only.');
  end if;
  if p_qr_path is not null and p_qr_path <> (auth.uid()::text || '/qr') then
    return jsonb_build_object('success', false, 'error', 'Invalid QR path.');
  end if;
  insert into public.provider_payment_details (user_id, qr_path)
  values (auth.uid(), p_qr_path)
  on conflict (user_id) do update set qr_path = excluded.qr_path, updated_at = now();
  return jsonb_build_object('success', true, 'qr_path', p_qr_path);
end;
$$;

revoke all on function public.set_my_provider_qr_path(text) from public, anon;
grant execute on function public.set_my_provider_qr_path(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-payment-qr', 'provider-payment-qr', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "provider_qr_self_select" on storage.objects for select to authenticated
using (bucket_id = 'provider-payment-qr' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "provider_qr_self_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'provider-payment-qr' and name = (auth.uid()::text || '/qr'));
create policy "provider_qr_self_update" on storage.objects for update to authenticated
using (bucket_id = 'provider-payment-qr' and name = (auth.uid()::text || '/qr'))
with check (bucket_id = 'provider-payment-qr' and name = (auth.uid()::text || '/qr'));
create policy "provider_qr_self_delete" on storage.objects for delete to authenticated
using (bucket_id = 'provider-payment-qr' and name = (auth.uid()::text || '/qr'));

create table if not exists public.provider_feedback (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  service text not null check (service in ('car', 'jubah', 'rental', 'transporter')),
  rating smallint not null check (rating between 1 and 5),
  message text not null check (length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.provider_feedback enable row level security;
create policy "provider_feedback_recipient_select" on public.provider_feedback for select to authenticated
using (provider_id = auth.uid());
grant select on public.provider_feedback to authenticated;
