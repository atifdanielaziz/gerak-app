-- In-app "Rate App" feature. Gerak isn't listed on an app store yet (PWA
-- install only), so there's no store-review deep link to send this button
-- to — this is a lightweight in-app star rating + optional comment instead.

create table if not exists public.app_ratings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null,
  rating     smallint not null check (rating between 1 and 5),
  comment    text,
  created_at timestamptz not null default now()
);

alter table public.app_ratings enable row level security;

-- Anyone (including a not-yet-logged-in guest, matching the Profile page's
-- own guest view which shows this same button) may submit a rating.
-- Reading them back is admin/superadmin only — this is feedback for the
-- team, not a public rating count.
create policy "anyone_can_submit_rating"
  on public.app_ratings for insert
  to anon, authenticated
  with check (true);

create policy "staff_read_ratings"
  on public.app_ratings for select
  using (public.get_my_role() in ('admin', 'superadmin'));

-- SECURITY DEFINER wrapper (rather than a raw table insert) so user_id is
-- always the caller's own id or null, never client-supplied — matches this
-- project's established pattern of never trusting a client-passed user id
-- for anything written against auth identity.
create or replace function public.submit_app_rating(p_rating smallint, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return jsonb_build_object('success', false, 'error', 'Rating must be between 1 and 5.');
  end if;

  begin
    insert into public.app_ratings (user_id, rating, comment)
    values (auth.uid(), p_rating, nullif(btrim(coalesce(p_comment, '')), ''));
  exception when others then
    raise warning 'submit_app_rating failed: % (sqlstate %)', sqlerrm, sqlstate;
    return jsonb_build_object('success', false, 'error', 'Could not submit your rating. Please try again.');
  end;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.submit_app_rating(smallint, text) to anon, authenticated;
