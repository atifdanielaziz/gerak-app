-- When a superadmin assigns a Lead to a university, attach the Jubah riders
-- already serving that university to the new Lead. This does not alter their
-- rider role, method assignments, bookings, or historical job ownership.

create or replace function public.jubah_profile_university_key(
  p_university text, p_campus text
) returns text language sql immutable as $$
  select case
    when lower(coalesce(p_university, '')) like '%pahang al-sultan%' or p_campus in ('Pekan','Gambang') then 'umpsa'
    when lower(coalesce(p_university, '')) like '%teknologi mara%' or p_campus in ('Shah Alam','Puncak Alam','Machang') then 'uitm'
    when lower(coalesce(p_university, '')) like '%malaysia kelantan%' or p_campus in ('Jeli','Bachok','Kota Bharu') then 'umk'
    when lower(coalesce(p_university, '')) like '%kebangsaan malaysia%' or p_campus = 'Bangi' then 'ukm'
    when lower(coalesce(p_university, '')) like '%islam antarabangsa%' or p_campus in ('Gombak','Kuantan') then 'uiam'
    when lower(coalesce(p_university, '')) like '%utara malaysia%' or p_campus = 'Sintok' then 'uum'
    when lower(coalesce(p_university, '')) like '%sultan zainal abidin%' or p_campus in ('Gong Badak','Medical','Besut') then 'unisza'
    when lower(coalesce(p_university, '')) like '%petronas%' or p_campus = 'Seri Iskandar' then 'utp'
    when lower(coalesce(p_university, '')) like '%putra malaysia%' or p_campus in ('Serdang','Sarawak') then 'upm'
    when lower(coalesce(p_university, '')) like '%universiti malaya%' or p_campus = 'Kuala Lumpur' then 'um'
    when lower(coalesce(p_university, '')) like '%sultan idris%' or p_campus in ('KSAJS','KSAS') then 'upsi'
    when lower(coalesce(p_university, '')) like '%malaysia sabah%' or p_campus in ('Kota Kinabalu','Labuan International','Sandakan') then 'ums'
    when lower(coalesce(p_university, '')) like '%malaysia sarawak%' or p_campus in ('Barat','Timur','Bandar') then 'unimas'
    else null
  end
$$;

create or replace function public.set_jubah_lead(
  p_user_id uuid, p_university_keys text[], p_active boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_base_key text;
begin
  if public.get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Unauthorised.');
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and role = 'rider' and coalesce(can_robe, false)) then
    return jsonb_build_object('success', false, 'error', 'Select a Jubah Rider. Drivers and Admins cannot be Jubah Leads.');
  end if;
  if p_active and coalesce(cardinality(p_university_keys), 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'Assign at least one university.');
  end if;
  select base_university_key into v_base_key from public.jubah_leads where user_id = p_user_id;
  if v_base_key is not null and p_active and not (v_base_key = any(coalesce(p_university_keys, array[]::text[]))) then
    return jsonb_build_object('success', false, 'error', 'The Base University is permanently locked and cannot be removed.');
  end if;

  insert into public.jubah_leads(user_id, is_active, created_by)
  values (p_user_id, p_active, auth.uid())
  on conflict (user_id) do update set is_active = excluded.is_active, updated_at = now();

  delete from public.jubah_lead_universities
  where lead_id = p_user_id and (v_base_key is null or university_key <> v_base_key);
  foreach v_key in array coalesce(p_university_keys, array[]::text[]) loop
    v_key := lower(trim(v_key));
    insert into public.jubah_lead_universities(lead_id, university_key, assigned_by)
    values (p_user_id, v_key, auth.uid())
    on conflict (lead_id, university_key) do nothing;

    insert into public.jubah_lead_runners(runner_id, lead_id, university_key, assigned_by)
    select p.id, p_user_id, v_key, auth.uid()
    from public.profiles p
    where p.id <> p_user_id
      and p.role = 'rider'
      and coalesce(p.can_robe, false)
      and public.jubah_profile_university_key(p.university, p.campus) = v_key
    on conflict (runner_id) do update
      set lead_id = excluded.lead_id,
          university_key = excluded.university_key,
          assigned_by = excluded.assigned_by,
          created_at = now();
  end loop;

  delete from public.jubah_lead_runners r
  where r.lead_id = p_user_id
    and not (r.university_key = any(coalesce(p_university_keys, array[]::text[])));
  return jsonb_build_object('success', true);
exception when check_violation or foreign_key_violation then
  return jsonb_build_object('success', false, 'error', 'One or more university assignments are invalid.');
end;
$$;

revoke all on function public.set_jubah_lead(uuid, text[], boolean) from public, anon;
grant execute on function public.set_jubah_lead(uuid, text[], boolean) to authenticated;
