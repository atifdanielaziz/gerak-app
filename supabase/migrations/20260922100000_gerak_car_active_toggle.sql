-- Mirrors the existing jubah_active pattern: Gerak Car orders are auto-
-- cancelling (no active driver picking them up in time), which looks bad
-- to customers placing them. Decided over WhatsApp (Adib + Atif,
-- 2026-09-22) not to disable the feature outright — just hide its entry
-- point on the customer Dashboard until drivers are onboarded properly in
-- October — so this is a plain visibility flag, same shape as
-- jubah_active, not a new mechanism.

insert into public.app_settings (key, value)
  values ('gerak_car_active', 'false')
  on conflict (key) do nothing;

drop policy if exists "settings_update" on public.app_settings;

create policy "settings_update" on public.app_settings
  for update
  to authenticated
  using (
    get_my_role() = 'superadmin'
    or (get_my_role() = 'admin' and key in ('jubah_active', 'receipt_gate_active', 'gerak_car_active'))
  )
  with check (
    get_my_role() = 'superadmin'
    or (get_my_role() = 'admin' and key in ('jubah_active', 'receipt_gate_active', 'gerak_car_active'))
  );
