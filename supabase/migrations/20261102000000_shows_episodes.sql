-- Step 7, stage A: our own shows and episodes (design: docs/DATA_MODEL.md).
-- Adds the tables and a new reference column next to each old Podcast Index number, then fills them
-- in from the details the app already copied into logs, Up next, sends, pins and briefs.
-- The app doesn't use any of this yet, and nothing old is changed or removed.

-- ---------- short ids ----------
-- Our ids are 8 random characters, like "k3x9q2ab". The alphabet skips look-alikes (0/o, 1/l).
create function public.new_ref() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('abcdefghijkmnpqrstuvwxyz23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8)
$$;

-- ---------- shows ----------
create table public.shows (
  id text primary key default public.new_ref(),
  title text not null,
  author text,
  description text,
  image_url text,
  website_url text,
  language text,
  categories jsonb not null default '[]',
  feed_url text unique,                          -- the show's own feed; blank for Spotify-only shows
  podcast_guid text unique,                      -- the show's permanent id from its feed
  podcastindex_id bigint unique,
  apple_id bigint unique,
  spotify_id text unique,
  source text not null check (source in ('podcastindex', 'feed', 'spotify', 'legacy')),
  last_fetched_at timestamptz,                   -- when we last refreshed it from outside
  fetch_error text,
  failures int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(author, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored
);
create index shows_search on public.shows using gin (search);

-- ---------- episodes ----------
create table public.episodes (
  id text primary key default public.new_ref(),
  show_id text not null references public.shows (id) on delete cascade,
  guid text,                                     -- the episode's id inside its feed
  title text not null,
  published_at timestamptz,
  duration_seconds int,
  image_url text,
  season int,
  episode_number int,
  description_html text,                         -- cleaned before saving: feeds are written by anyone
  description_text text,
  audio_url text,
  episode_url text,
  transcripts jsonb not null default '[]',
  podcastindex_id bigint unique,
  apple_id bigint unique,
  spotify_id text unique,
  source text not null check (source in ('podcastindex', 'feed', 'spotify', 'legacy')),
  last_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, guid),
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description_text, '')), 'C')
  ) stored
);
create index episodes_show_recent on public.episodes (show_id, published_at desc);
create index episodes_search on public.episodes using gin (search);

-- Anyone can read shows and episodes. Only the server (service key) adds or changes them.
alter table public.shows enable row level security;
alter table public.episodes enable row level security;
create policy "shows read" on public.shows for select using (true);
create policy "episodes read" on public.episodes for select using (true);
grant select on public.shows, public.episodes to anon, authenticated;
revoke insert, update, delete on public.shows, public.episodes from anon, authenticated;

-- ---------- new references next to the old Podcast Index numbers ----------
alter table public.logs add column episode_ref text references public.episodes (id);
alter table public.logs add constraint logs_user_episode_ref unique (user_id, episode_ref);
create index logs_episode_ref on public.logs (episode_ref);

alter table public.list_items add column episode_ref text references public.episodes (id);
alter table public.list_items add column show_ref text references public.shows (id);
alter table public.recommendations add column episode_ref text references public.episodes (id);
alter table public.comments add column episode_ref text references public.episodes (id);
alter table public.reactions add column episode_ref text references public.episodes (id);
alter table public.notifications add column episode_ref text references public.episodes (id);
alter table public.hooked_shows add column show_ref text references public.shows (id);
create index comments_episode_ref on public.comments (episode_ref);
create index reactions_episode_ref on public.reactions (episode_ref);

-- ---------- fill in from what the app already copied ----------
-- Safe to run again: it only adds shows and episodes we don't have yet and only fills empty references.
-- Stage B runs it once more to catch anything logged in between.
create function public.backfill_refs() returns void
language plpgsql set search_path = '' as $$
begin
  -- Every show mentioned anywhere, with the best title and cover we have for it.
  -- Lower "pri" wins: a pinned show's own details beat details copied with an episode.
  insert into public.shows (podcastindex_id, title, image_url, source)
  select feed_id,
         coalesce((array_agg(title order by pri, seen desc) filter (where title is not null))[1], 'Untitled show'),
         (array_agg(image order by pri, seen desc) filter (where image is not null))[1],
         'legacy'
  from (
    select feed_id, title, image, created_at as seen, 1 as pri from public.hooked_shows
    union all select feed_id, feed_title, feed_image, logged_at, 2 from public.logs
    union all select feed_id, feed_title, null, created_at, 3 from public.recommendations
    union all select feed_id, feed_title, null, created_at, 3 from public.list_items
    union all
    select (it ->> 'feedId')::bigint, it ->> 'show', null, b.created_at, 4
    from public.briefs b, jsonb_array_elements(b.items) it
    where it ->> 'feedId' ~ '^\d+$'
  ) s
  where feed_id is not null
    and not exists (select 1 from public.shows x where x.podcastindex_id = s.feed_id)
  group by feed_id;

  -- Every episode mentioned anywhere, attached to its show.
  insert into public.episodes (podcastindex_id, show_id, title, image_url, audio_url, duration_seconds, source)
  select s.episode_id, (array_agg(sh.id order by s.seen desc))[1],
         coalesce((array_agg(s.title order by s.seen desc) filter (where s.title is not null))[1], 'Untitled episode'),
         (array_agg(s.image order by s.seen desc) filter (where s.image is not null))[1],
         (array_agg(s.audio order by s.seen desc) filter (where s.audio is not null))[1],
         (array_agg(s.duration order by s.seen desc) filter (where s.duration is not null))[1],
         'legacy'
  from (
    select episode_id, feed_id, title, image, audio, duration, logged_at as seen from public.logs
    union all select episode_id, feed_id, title, image, audio, duration, created_at from public.recommendations
    union all select episode_id, feed_id, title, image, null, null, created_at from public.list_items where episode_id is not null
    union all
    select (it ->> 'episodeId')::bigint, (it ->> 'feedId')::bigint, it ->> 'episode', it ->> 'image', it ->> 'audio',
           case when it ->> 'duration' ~ '^\d+$' then (it ->> 'duration')::int end, b.created_at
    from public.briefs b, jsonb_array_elements(b.items) it
    where it ->> 'episodeId' ~ '^\d+$' and it ->> 'feedId' ~ '^\d+$'
  ) s
  join public.shows sh on sh.podcastindex_id = s.feed_id
  where not exists (select 1 from public.episodes x where x.podcastindex_id = s.episode_id)
  group by s.episode_id;

  -- Point every row at our ids.
  update public.logs t set episode_ref = e.id from public.episodes e where t.episode_ref is null and e.podcastindex_id = t.episode_id;
  update public.recommendations t set episode_ref = e.id from public.episodes e where t.episode_ref is null and e.podcastindex_id = t.episode_id;
  update public.list_items t set episode_ref = e.id from public.episodes e where t.episode_ref is null and e.podcastindex_id = t.episode_id;
  update public.list_items t set show_ref = s.id from public.shows s where t.show_ref is null and s.podcastindex_id = t.feed_id;
  update public.comments t set episode_ref = e.id from public.episodes e where t.episode_ref is null and e.podcastindex_id = t.episode_id;
  update public.reactions t set episode_ref = e.id from public.episodes e where t.episode_ref is null and e.podcastindex_id = t.episode_id;
  update public.notifications t set episode_ref = e.id from public.episodes e where t.episode_ref is null and e.podcastindex_id = t.episode_id;
  update public.hooked_shows t set show_ref = s.id from public.shows s where t.show_ref is null and s.podcastindex_id = t.feed_id;

  -- Brief items keep everything they have and gain "episodeRef" and "showRef".
  update public.briefs b set items = (
    select jsonb_agg(
             case when e.id is null or it ? 'episodeRef' then it
                  else it || jsonb_build_object('episodeRef', e.id, 'showRef', e.show_id) end
             order by n)
    from jsonb_array_elements(b.items) with ordinality as x(it, n)
    left join public.episodes e on e.podcastindex_id::text = x.it ->> 'episodeId'
  )
  where jsonb_array_length(b.items) > 0
    and exists (select 1 from jsonb_array_elements(b.items) it where not it ? 'episodeRef');
end;
$$;
revoke execute on function public.backfill_refs() from public, anon, authenticated;
revoke execute on function public.new_ref() from public, anon, authenticated;
grant execute on function public.new_ref() to service_role;

select public.backfill_refs();
