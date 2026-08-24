-- Retry of 20260824310000: that migration reported success but changed
-- nothing, because protect_privileged_profile_columns (before-update
-- trigger on profiles) silently reverts can_drive to its old value unless
-- get_my_role() resolves to admin/superadmin — and a migration running via
-- the CLI has no auth.uid() session, so it was treated as an unprivileged
-- self-update and reverted. Scoping the trigger disable to just this one
-- statement rather than changing the trigger's general logic.
alter table public.profiles disable trigger protect_privileged_profile_columns;

update public.profiles p
set can_drive = true
from public.driver_invites di
where di.email = p.email
  and p.role = 'driver'
  and p.can_drive = false
  and di.can_drive = true;

alter table public.profiles enable trigger protect_privileged_profile_columns;
