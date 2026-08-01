-- ============================================================
-- Superadmin Activity Log — audit trail for admin/superadmin actions
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- No audit trail existed anywhere in this app before this. Rather than
-- adding an explicit "log this" call at each of the ~38 admin-mutating
-- RPCs/direct writes found across the codebase (JubahPriceSubTab,
-- UsersTab, VerifyDocsTab, ReceiptsTab, OrdersTab, BannersTab, RoutesTab,
-- CalendarTab, JubahCustomerSubTab, JubahRiderSubTab, DriversTab) — which
-- would mean remembering to add a log call to every NEW admin action too,
-- forever — this uses Postgres triggers on the sensitive tables
-- themselves. A trigger fires on the actual row change regardless of
-- whether it came from a direct .update() or from inside a SECURITY
-- DEFINER RPC, so this covers every mutation path found today AND most
-- future ones automatically (a new capability flag is just a new column
-- on an already-tracked table; a new setting is just a new app_settings
-- row). auth.uid() resolves to the real calling user even inside a
-- SECURITY DEFINER function's trigger — it reads the request's JWT
-- claims, not the function owner.

create table if not exists public.admin_activity_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_name  text not null default 'Unknown',
  table_name  text not null,
  record_id   text,
  action      text not null,
  changes     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_activity_log_created_at_idx on public.admin_activity_log (created_at desc);
create index if not exists admin_activity_log_table_name_idx on public.admin_activity_log (table_name);

alter table public.admin_activity_log enable row level security;

-- Superadmin-only read, matching the receipts/earnings tab pattern
-- (superadminOnly: true in ADMIN_TABS). No INSERT/UPDATE/DELETE policy
-- at all — the trigger function below is the ONLY writer, running as
-- SECURITY DEFINER owned by postgres, which bypasses RLS/grants
-- entirely as the table owner. Explicit revoke as a safety net
-- regardless of Postgres's own defaults — jubah_bookings had
-- unexpectedly wide-open grants earlier this session, so this doesn't
-- assume anything is safe by default.
create policy "superadmin_read_activity_log"
  on public.admin_activity_log
  for select
  to authenticated
  using (get_my_role() = 'superadmin');

revoke insert, update, delete on public.admin_activity_log from authenticated, anon;

-- ── The generic trigger function ────────────────────────────────────────
--
-- One reusable function attached to every tracked table, rather than a
-- near-identical copy per table (the same duplication this session has
-- fixed repeatedly already: JubahBalancePayment, JubahStepper,
-- check_jubah_rate_limit). An optional comma-separated column allowlist
-- is passed as the trigger's argument — omitted means "log the full row"
-- (fine for tables with no PII: app_settings, driver_invites, routes,
-- announcements, academic_calendars, jubah_rider_assignments). Tables
-- that carry customer PII (profiles, jubah_bookings) pass an explicit
-- allowlist so the log only ever captures the administrative fields —
-- role/status/capabilities, or booking status/cancellation — never the
-- IC number, phone, address, etc. sitting in the same row.
create or replace function public.log_admin_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_name text;
  v_record_id  text;
  v_old        jsonb;
  v_new        jsonb;
  v_cols       text[];
begin
  if TG_NARGS > 0 and TG_ARGV[0] <> '' then
    v_cols := string_to_array(TG_ARGV[0], ',');
  end if;

  if TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_new := null;
  elsif TG_OP = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(NEW);
  else
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  end if;

  -- Most tracked tables key on `id`; app_settings keys on `key` instead
  -- (it has no id column at all) — coalesce covers both without needing
  -- a special case per table.
  v_record_id := coalesce((v_new ->> 'id'), (v_old ->> 'id'), (v_new ->> 'key'), (v_old ->> 'key'));

  if v_cols is not null then
    if v_old is not null then
      select jsonb_object_agg(k, v_old -> k) into v_old from unnest(v_cols) as k where v_old ? k;
    end if;
    if v_new is not null then
      select jsonb_object_agg(k, v_new -> k) into v_new from unnest(v_cols) as k where v_new ? k;
    end if;
  end if;

  -- An UPDATE that only touched columns outside the allowlist (e.g. a
  -- profile's updated_at bumping alongside an unrelated column) would
  -- otherwise log a "changed nothing" row once scoped down to v_cols.
  if TG_OP = 'UPDATE' and v_old is not distinct from v_new then
    return NEW;
  end if;

  if v_actor_id is not null then
    select name into v_actor_name from public.profiles where id = v_actor_id;
  end if;

  insert into public.admin_activity_log (actor_id, actor_name, table_name, record_id, action, changes)
  values (
    v_actor_id,
    coalesce(v_actor_name, 'System'),
    TG_TABLE_NAME,
    v_record_id,
    lower(TG_OP),
    jsonb_build_object('old', v_old, 'new', v_new)
  );

  return coalesce(NEW, OLD);
end;
$$;

-- ── Attachments ──────────────────────────────────────────────────────────

drop trigger if exists log_activity on public.app_settings;
create trigger log_activity
  after update on public.app_settings
  for each row execute function public.log_admin_activity();

drop trigger if exists log_activity on public.driver_invites;
create trigger log_activity
  after insert or delete on public.driver_invites
  for each row execute function public.log_admin_activity();

drop trigger if exists log_activity on public.routes;
create trigger log_activity
  after insert or update or delete on public.routes
  for each row execute function public.log_admin_activity();

drop trigger if exists log_activity on public.announcements;
create trigger log_activity
  after insert or update or delete on public.announcements
  for each row execute function public.log_admin_activity();

drop trigger if exists log_activity on public.academic_calendars;
create trigger log_activity
  after insert or update on public.academic_calendars
  for each row execute function public.log_admin_activity();

drop trigger if exists log_activity on public.jubah_rider_assignments;
create trigger log_activity
  after insert or delete on public.jubah_rider_assignments
  for each row execute function public.log_admin_activity();

drop trigger if exists log_activity on public.profiles;
create trigger log_activity
  after update on public.profiles
  for each row execute function public.log_admin_activity(
    'role,status,can_drive,can_rent,can_transport,can_daily,can_robe,receipt_gate_exempt,campus,docs_status'
  );

drop trigger if exists log_activity on public.jubah_bookings;
create trigger log_activity
  after update or delete on public.jubah_bookings
  for each row execute function public.log_admin_activity(
    'status,cancelled_at,cancelled_by,balance_paid,needs_reconciliation'
  );

drop trigger if exists log_activity on public.ride_orders;
create trigger log_activity
  after delete on public.ride_orders
  for each row execute function public.log_admin_activity('id,status');
