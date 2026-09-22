-- Extends the gerak_car_active / jubah_active pattern to the rest of the
-- Dashboard's Campus Modules — Gerak Daily (currently a permanent
-- "Coming soon" placeholder), Gerak Rental and Gerak Transporter (both
-- always shown, no flag existed for either). All three seed 'true' so
-- nothing changes visually on deploy — this only gives Settings a switch
-- to flip later, same as the two that already exist.

insert into public.app_settings (key, value) values
  ('gerak_daily_active', 'true'),
  ('gerak_rental_active', 'true'),
  ('gerak_transporter_active', 'true')
on conflict (key) do nothing;

drop policy if exists "settings_update" on public.app_settings;

create policy "settings_update" on public.app_settings
  for update
  to authenticated
  using (
    get_my_role() = 'superadmin'
    or (get_my_role() = 'admin' and key in (
      'jubah_active', 'receipt_gate_active', 'gerak_car_active',
      'gerak_daily_active', 'gerak_rental_active', 'gerak_transporter_active'
    ))
  )
  with check (
    get_my_role() = 'superadmin'
    or (get_my_role() = 'admin' and key in (
      'jubah_active', 'receipt_gate_active', 'gerak_car_active',
      'gerak_daily_active', 'gerak_rental_active', 'gerak_transporter_active'
    ))
  );
