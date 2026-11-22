-- One-time: give a handle to everyone who signed up without picking one (YY, 2026-11-22: "I want to be able to follow
-- them asap but don't want to ask them to create a handle"). A profile without a handle can't be found or followed.
-- New sign-ups pick their own handle on the sign-up form, so this runs once and leaves nothing behind.
--
-- The handle comes from the person's name if their sign-in gave one (Google does), otherwise from the part of their
-- email before the @ (YY chose this). Letters, numbers, dots and underscores only; a number is added if it's taken.
-- Anyone can change theirs on My log → settings (the gear) → Edit profile.
-- No email addresses are written here: they're read from the database when this runs.

create function public.make_handle(source text)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  base := lower(coalesce(source, ''));
  base := regexp_replace(base, '\s+', '.', 'g');          -- "Maya Chen" → "maya.chen"
  base := regexp_replace(base, '[^a-z0-9._]', '', 'g');    -- drop anything a handle can't hold
  base := regexp_replace(base, '[._]{2,}', '.', 'g');
  base := regexp_replace(base, '^[._]+|[._]+$', '', 'g');
  base := left(base, 18);
  base := regexp_replace(base, '[._]+$', '');
  if char_length(base) < 2 then
    base := 'listener';
  end if;
  candidate := base;
  while exists (select 1 from public.profiles p where p.handle = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  return candidate;
end;
$$;
revoke all on function public.make_handle(text) from public, anon, authenticated;

-- The name and email of the account behind a profile. Read as json so it works whatever columns auth.users has.
create function public.fill_handle()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  account jsonb;
  meta jsonb;
  full_name text;
begin
  if new.handle is not null then
    return new;
  end if;
  select to_jsonb(u) into account from auth.users u where u.id = new.id;
  meta := coalesce(account -> 'raw_user_meta_data', '{}'::jsonb);
  full_name := nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), '');
  new.handle := public.make_handle(coalesce(full_name, split_part(split_part(account ->> 'email', '@', 1), '+', 1)));
  if new.display_name is null and full_name is not null then
    new.display_name := left(full_name, 60);
  end if;
  return new;
end;
$$;
revoke all on function public.fill_handle() from public, anon, authenticated;

create trigger fill_handle before insert or update on public.profiles
  for each row execute function public.fill_handle();

-- Today's profiles without a handle, and accounts with no profile row yet (signed up, haven't opened Hooked since):
-- one at a time, so each new handle is seen by the next and two people can't get the same one.
do $$
declare
  r record;
begin
  for r in select p.id from public.profiles p where p.handle is null order by p.created_at loop
    update public.profiles set handle = null where id = r.id;
  end loop;
  for r in select u.id from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id) loop
    insert into public.profiles (id) values (r.id) on conflict do nothing;
  end loop;
end;
$$;

-- Done: remove the trigger and helpers, so new sign-ups always choose their own handle.
drop trigger fill_handle on public.profiles;
drop function public.fill_handle();
drop function public.make_handle(text);
