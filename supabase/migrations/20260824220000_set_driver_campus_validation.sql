-- ============================================================
-- Add input validation to set_driver_campus
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
--
-- Role check was already correct (admin/superadmin only); p_university/
-- p_campus had no length or non-empty check at all, unlike every other
-- RPC writing to these same two columns (create_jubah_booking validates
-- both). Low practical risk since it's admin-gated, but inconsistent —
-- same bounds create_jubah_booking already uses on the identical columns.

create or replace function public.set_driver_campus(p_user_id uuid, p_university text, p_campus text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if get_my_role() not in ('admin', 'superadmin') then
    raise exception 'Not authorised';
  end if;

  if p_university is null or length(trim(p_university)) = 0 or length(p_university) > 150 then
    raise exception 'Invalid university.';
  end if;
  if p_campus is null or length(trim(p_campus)) = 0 or length(p_campus) > 50 then
    raise exception 'Invalid campus.';
  end if;

  update public.profiles
  set university = p_university, campus = p_campus
  where id = p_user_id;
end;
$$;
