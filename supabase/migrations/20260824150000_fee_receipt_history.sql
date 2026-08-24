-- ============================================================
-- Keep the last 3 months of fee receipts instead of destroying each one
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Today: handleReceiptUpload always writes to the same fixed path
-- (driverId/monthly_receipt.<ext>) and deletes whatever was there first —
-- a driver re-uploading loses the previous month's receipt (file and
-- metadata) permanently, with no way to look back on a dispute later.
--
-- Also found while wiring this up: 20260614022921_driver_profile_v2.sql
-- never added a storage DELETE policy for drivers on their own folder —
-- the existing list+remove cleanup call in handleReceiptUpload has likely
-- been silently failing (permission denied, never checked) this whole
-- time. Needed for real this time, since the 3-file cap below actually
-- depends on it succeeding.

-- 1. Stable reference to the CURRENT receipt's storage object, separate
--    from fee_receipt_url (a signed link that expires after 30 days —
--    fine for "the current receipt admin needs to review this month," not
--    something to archive since it'll be a dead link long before 3 months
--    pass). The trigger below reads this to know what to archive.
alter table public.profiles
  add column if not exists fee_receipt_storage_path text not null default '';

-- 2. History table — one row per past receipt, most recent 3 per driver.
create table if not exists public.fee_receipt_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  storage_path   text not null,
  amount         text,
  submitted_date text,
  expiry         date,
  verified       boolean not null default false,
  reject_reason  text,
  archived_at    timestamptz not null default now()
);
create index if not exists fee_receipt_history_user_id_idx on public.fee_receipt_history (user_id, archived_at desc);

alter table public.fee_receipt_history enable row level security;

-- Read-only from the client side in both directions — a driver sees their
-- own history, staff sees everyone's (same shape as "Staff can read all
-- profiles"). Nothing is ever granted insert/update/delete: only the
-- SECURITY DEFINER trigger below writes here, same posture as every other
-- staff-controlled column on profiles itself.
create policy "own_or_staff_read_fee_receipt_history"
  on public.fee_receipt_history for select
  using (auth.uid() = user_id or public.get_my_role() in ('admin', 'superadmin'));

-- 3. Storage: the missing DELETE policy (own folder only, same pattern as
--    the existing insert/select/update policies right above it), plus a
--    staff-read policy so admin can generate a fresh signed URL for a
--    driver's historical receipt on demand — the driver-only select
--    policy from 20260614022921 doesn't cover admin viewing someone
--    else's object.
create policy "Drivers can delete own receipt"
  on storage.objects for delete
  using (
    bucket_id = 'driver-receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Staff can read any receipt"
  on storage.objects for select
  using (
    bucket_id = 'driver-receipts'
    and public.get_my_role() in ('admin', 'superadmin')
  );

-- 4. Archive-on-replace, folded into the same self-service trigger that
--    already resets fee_receipt_verified when fee_receipt_url changes
--    (20260824140000) — same detection, one more consequence of it.
create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.get_my_role() in ('admin', 'superadmin') then
    return new;
  end if;

  if current_setting('app.applying_invite', true) = 'true' then
    return new;
  end if;

  new.role                      := old.role;
  new.status                    := old.status;
  new.campus                    := old.campus;
  new.can_drive                 := old.can_drive;
  new.can_rent                  := old.can_rent;
  new.can_daily                 := old.can_daily;
  new.can_robe                  := old.can_robe;
  new.can_transport              := old.can_transport;
  new.receipt_gate_exempt       := old.receipt_gate_exempt;
  new.docs_reject_reason        := old.docs_reject_reason;
  new.fee_receipt_verified      := old.fee_receipt_verified;
  new.fee_receipt_auto_verified := old.fee_receipt_auto_verified;
  new.fee_receipt_amount        := old.fee_receipt_amount;
  new.fee_receipt_date          := old.fee_receipt_date;
  new.fee_receipt_expiry        := old.fee_receipt_expiry;
  new.fee_receipt_reject_reason := old.fee_receipt_reject_reason;
  new.gerak_id                  := old.gerak_id;
  new.points                    := old.points;
  new.jubah_method               := old.jubah_method;
  new.jubah_drop_point            := old.jubah_drop_point;

  if new.docs_status is distinct from old.docs_status and new.docs_status is distinct from 'pending' then
    new.docs_status := old.docs_status;
  end if;

  if old.gender is not null and new.gender is distinct from old.gender then
    new.gender := old.gender;
  end if;

  if new.fee_receipt_url is distinct from old.fee_receipt_url then
    if old.fee_receipt_storage_path is not null and old.fee_receipt_storage_path <> '' then
      insert into public.fee_receipt_history
        (user_id, storage_path, amount, submitted_date, expiry, verified, reject_reason)
      values
        (old.id, old.fee_receipt_storage_path, old.fee_receipt_amount, old.fee_receipt_date,
         old.fee_receipt_expiry, old.fee_receipt_verified, old.fee_receipt_reject_reason);

      delete from public.fee_receipt_history
      where user_id = old.id
        and id not in (
          select id from public.fee_receipt_history
          where user_id = old.id
          order by archived_at desc
          limit 3
        );
    end if;

    new.fee_receipt_verified      := false;
    new.fee_receipt_reject_reason := '';
  end if;

  return new;
end;
$function$;
