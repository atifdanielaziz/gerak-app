-- Activity log currently records who (actor_name) and what (table_name/
-- action) but not what role the actor held at the time — so there's no way
-- to filter "show me everything a superadmin did" vs "show me what admins
-- did" vs "show me automated/cron activity" without cross-referencing
-- profiles.role by hand (which also drifts: a promoted/demoted user's
-- current role no longer reflects what they were when the action happened).
--
-- Snapshotting the role at insert time, same rationale as actor_name
-- already being snapshotted rather than joined live. Cron/service-role
-- writes (no auth.uid()) get 'system' instead of null so they're a normal,
-- filterable value rather than a special case the UI has to know about.

alter table public.admin_activity_log
  add column if not exists actor_role text;

create index if not exists admin_activity_log_actor_role_idx on public.admin_activity_log (actor_role);

create or replace function public.log_admin_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
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

  v_record_id := coalesce((v_new ->> 'id'), (v_old ->> 'id'), (v_new ->> 'key'), (v_old ->> 'key'));

  if v_cols is not null then
    if v_old is not null then
      select jsonb_object_agg(k, v_old -> k) into v_old from unnest(v_cols) as k where v_old ? k;
    end if;
    if v_new is not null then
      select jsonb_object_agg(k, v_new -> k) into v_new from unnest(v_cols) as k where v_new ? k;
    end if;
  end if;

  if TG_OP = 'UPDATE' and v_old is not distinct from v_new then
    return NEW;
  end if;

  if v_actor_id is not null then
    select name, role into v_actor_name, v_actor_role from public.profiles where id = v_actor_id;
  else
    v_actor_role := 'system';
  end if;

  insert into public.admin_activity_log (actor_id, actor_name, actor_role, table_name, record_id, action, changes)
  values (
    v_actor_id,
    coalesce(v_actor_name, 'System'),
    v_actor_role,
    TG_TABLE_NAME,
    v_record_id,
    lower(TG_OP),
    jsonb_build_object('old', v_old, 'new', v_new)
  );

  return coalesce(NEW, OLD);
end;
$$;

-- Backfill existing rows so the new filter isn't blank for history that
-- already happened — best-effort from the current profiles.role (may not
-- exactly match the role at the time for a since-promoted/demoted actor,
-- which is the one gap snapshotting-going-forward can't retroactively fix).
update public.admin_activity_log l
set actor_role = coalesce(p.role, 'system')
from public.profiles p
where l.actor_role is null and l.actor_id = p.id;

update public.admin_activity_log
set actor_role = 'system'
where actor_role is null and actor_id is null;
