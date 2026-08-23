-- update_ride_status originally had a status allowlist and a driver
-- transition guard (accepted->in_progress->completed, accepted->cancelled;
-- see 20260616073313_security_hardening.sql, "FIX 3"). A later migration
-- (20260713180255_ride_complete_requires_fare.sql) added the fare-before-
-- complete check by fully replacing the function, and silently dropped
-- both guardrails in the process — the live version accepted any string as
-- p_status and any transition on a driver's own order, e.g. a driver
-- calling update_ride_status(own_order_id, 'garbage') or jumping straight
-- accepted->completed.
--
-- Restores both guardrails from the original fix, keeps the fare check
-- (unconditional — applies to anyone completing an order, not just
-- drivers, matching that migration's original unconditional behavior).

create or replace function public.update_ride_status(p_order_id uuid, p_status text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role       text;
  v_driver_id  uuid;
  v_cur_status text;
  v_fare       text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('driver', 'admin', 'superadmin') then
    return json_build_object('success', false, 'error', 'Not authorised');
  end if;

  if p_status not in ('accepted', 'in_progress', 'completed', 'cancelled') then
    return json_build_object('success', false, 'error', 'Invalid status');
  end if;

  select driver_id, status, fare into v_driver_id, v_cur_status, v_fare
  from public.ride_orders where id = p_order_id;

  if v_role = 'driver' and v_driver_id <> auth.uid() then
    return json_build_object('success', false, 'error', 'Not your order');
  end if;

  -- Admins/superadmins can override to any allowed status; drivers are
  -- restricted to real forward transitions on their own order.
  if v_role = 'driver' then
    if not (
      (v_cur_status = 'accepted'    and p_status = 'in_progress') or
      (v_cur_status = 'in_progress' and p_status = 'completed')   or
      (v_cur_status = 'accepted'    and p_status = 'cancelled')
    ) then
      return json_build_object('success', false, 'error', 'Invalid status transition');
    end if;
  end if;

  if p_status = 'completed' and v_fare = 'TBC' then
    return json_build_object('success', false, 'error', 'Set the trip fare before completing.');
  end if;

  update public.ride_orders
    set status = p_status
    where id = p_order_id
      and (driver_id = auth.uid() or v_role in ('admin', 'superadmin'));

  return json_build_object('success', true);
end;
$$;

grant execute on function public.update_ride_status(uuid, text) to authenticated;
