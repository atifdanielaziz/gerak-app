-- ============================================================
-- Migration: Per-university WhatsApp group invite link for Jubah
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Shown to the customer right after a successful booking ("Mintak join
-- group ya") so collection/delivery updates reach them in one place.
-- Stored in app_settings as jubah_wa_group_<university_key> — public read
-- like the rest of app_settings (guests book too), write only via this
-- superadmin-only RPC. Direct UPDATE stays blocked by the settings_update
-- allowlist (20260728191427), and there is no INSERT policy, so this RPC
-- is the only write path.
--
-- The link is user-facing and clickable, so it's validated server-side to
-- a bare chat.whatsapp.com invite (no scheme tricks like javascript:, no
-- other domains, no query string) — an edited value can't turn the
-- button into a phishing/redirect link to somewhere else.

create or replace function public.set_jubah_whatsapp_group(p_university text, p_url text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_key text;
begin
  if get_my_role() <> 'superadmin' then
    return jsonb_build_object('success', false, 'error', 'Superadmin only.');
  end if;
  if p_university is null or p_university !~ '^[a-z]{2,12}$' then
    return jsonb_build_object('success', false, 'error', 'Invalid university.');
  end if;
  v_key := 'jubah_wa_group_' || p_university;

  -- Empty clears the link (customers then see no join prompt).
  if v_url is null then
    delete from public.app_settings where key = v_key;
    return jsonb_build_object('success', true, 'url', null);
  end if;

  -- Drop WhatsApp's own tracking query (?s=cl&p=a…) before validating.
  v_url := split_part(v_url, '?', 1);
  if v_url !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$' then
    return jsonb_build_object('success', false, 'error', 'Enter a WhatsApp group invite link (https://chat.whatsapp.com/…).');
  end if;

  insert into public.app_settings (key, value) values (v_key, v_url)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('success', true, 'url', v_url);
end;
$$;

revoke all on function public.set_jubah_whatsapp_group(text, text) from public, anon;
grant execute on function public.set_jubah_whatsapp_group(text, text) to authenticated;

-- UMPSA's group, provided by the product owner on 2026-10-04.
insert into public.app_settings (key, value)
values ('jubah_wa_group_umpsa', 'https://chat.whatsapp.com/HBnXTmGy8sIBVXlrZ1Xupw')
on conflict (key) do nothing;
