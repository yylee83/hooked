-- Security review fixes (YY, 2026-11-26). Test: node scripts/check-security.mjs

-- 1. Saving a list could create made-up shows and episodes.
-- fill_refs_briefs used to create a catalog entry from whatever the list's items said (title, cover, audio), so
-- anyone could plant a fake episode on the site by saving a list through the API. Now it only looks up episodes we
-- already have. The list builder asks /api/catalog/ensure first, which only creates entries from Podcast Index.
create or replace function public.fill_refs_briefs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  ep text;
  sh text;
  result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then
    return new;
  end if;
  for it in select x from jsonb_array_elements(new.items) as x loop
    ep := null;
    sh := null;
    if it ->> 'episodeRef' ~ '^[a-z2-9]{8}$' then
      select e.id, e.show_id into ep, sh from public.episodes e where e.id = it ->> 'episodeRef';
    end if;
    if ep is null and it ->> 'episodeId' ~ '^\d{1,15}$' then
      select e.id, e.show_id into ep, sh from public.episodes e where e.podcastindex_id = (it ->> 'episodeId')::bigint;
    end if;
    if ep is not null then
      it := it || jsonb_build_object('episodeRef', ep, 'showRef', sh);
    else
      it := it - 'episodeRef' - 'showRef'; -- never keep an id that isn't ours
    end if;
    result := result || jsonb_build_array(it);
  end loop;
  new.items := result;
  return new;
end;
$$;
revoke execute on function public.fill_refs_briefs() from public, anon, authenticated;

-- Lists hold at most 12 episodes in the app; 50 and 256 KB leave plenty of room. Topic as long as the title.
-- not valid: only new saves are checked.
alter table public.briefs add constraint briefs_items_size
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 50 and pg_column_size(items) <= 262144) not valid;
alter table public.briefs add constraint briefs_topic_length check (char_length(topic) <= 80) not valid;
alter table public.recommendations add constraint recommendations_hook_length check (char_length(hook) <= 280) not valid;

-- 2. "Listening now" could show anything.
-- profiles.now_playing was saved exactly as sent, and Home shows it to everyone ("Listening on Hooked now"), so a
-- made-up title or picture could be put there through the API. Now the database keeps only which episode it is and
-- fills in the title, show and cover from our own tables. An episode we don't have clears it.
-- Also: now_playing_at can't be in the future (to stay at the top), and names and interests have a size limit.
create function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r text;
  pid text;
  e record;
begin
  if tg_op = 'INSERT' or new.now_playing is distinct from old.now_playing then
    if new.now_playing is not null then
      r := new.now_playing ->> 'ref';
      pid := new.now_playing ->> 'id';
      select ep.id, ep.podcastindex_id, ep.title, coalesce(ep.image_url, sh.image_url) as image,
             sh.title as show_title, sh.podcastindex_id as feed_id
        into e
        from public.episodes ep join public.shows sh on sh.id = ep.show_id
        where (r ~ '^[a-z2-9]{8}$' and ep.id = r)
           or (coalesce(r, '') = '' and pid ~ '^\d{1,15}$' and ep.podcastindex_id = pid::bigint)
        limit 1;
      if e.id is null then
        new.now_playing := null;
      else
        new.now_playing := jsonb_strip_nulls(jsonb_build_object(
          'ref', e.id, 'id', e.podcastindex_id, 'title', e.title,
          'feedId', e.feed_id, 'feedTitle', e.show_title, 'image', e.image));
      end if;
    end if;
  end if;
  if new.now_playing_at > now() then
    new.now_playing_at := now();
  end if;
  if (tg_op = 'INSERT' or new.display_name is distinct from old.display_name) and char_length(new.display_name) > 100 then
    raise exception 'That name is too long.' using errcode = '22001';
  end if;
  if (tg_op = 'INSERT' or new.interests is distinct from old.interests) and pg_column_size(new.interests) > 8192 then
    raise exception 'Too many interests.' using errcode = '22001';
  end if;
  return new;
end $$;
revoke execute on function public.profiles_guard() from public, anon, authenticated;
create trigger profiles_guard before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- 3. Who you sent a log to was public.
-- logs.sent_to (the handles you picked under "Send it to a friend" on the log sheet) could be read by anyone, though
-- sends are private. The same sends are in recommendations, which only the sender and the person sent to can see, and
-- the log sheet now reads "Already sent" from there. So sent_to is emptied (after a private copy, below) and kept empty (older copies of the app
-- still send it). The column stays, so nothing that mentions it breaks.
create function public.logs_no_sent_to() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.sent_to := '[]'::jsonb;
  return new;
end $$;
revoke execute on function public.logs_no_sent_to() from public, anon, authenticated;
create trigger logs_no_sent_to before insert or update of sent_to on public.logs
  for each row execute function public.logs_no_sent_to();
-- Kept, not lost (YY, 2026-11-26): the old notes are copied into a team-only table first (no app access; read it
-- in Supabase → Table Editor → log_sends_archive).
create table public.log_sends_archive (
  user_id uuid not null,
  episode_ref text,
  sent_to jsonb not null,
  logged_at timestamptz,
  archived_at timestamptz not null default now()
);
alter table public.log_sends_archive enable row level security;
revoke all on public.log_sends_archive from anon, authenticated;
insert into public.log_sends_archive (user_id, episode_ref, sent_to, logged_at)
  select l.user_id, l.episode_ref, l.sent_to, l.logged_at from public.logs l where l.sent_to <> '[]'::jsonb;
update public.logs set sent_to = '[]'::jsonb where sent_to <> '[]'::jsonb;
