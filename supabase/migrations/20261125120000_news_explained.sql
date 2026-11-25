-- Search's "In the news, explained" (YY, 2026-11-25): what the team can steer, what the app learns from, and
-- following a story.
--
-- 1. news_picks: the editor's override. To pin a great episode to a story, or block a bad one:
--    Supabase → Table Editor → news_picks → Insert row:
--      topic   the story's name as its chip shows it ("Strait of Hormuz"; any capitals), or * for every story
--      action  pin or block
--      episode_ref  the episode's id: the 8 letters at the end of its Hooked link (/episode/abcd2345)
--      or show_ref  a show's id (/show/…), to block a whole show (pins are for episodes)
--    Changes show within 3 hours (the row is remade then).
-- 2. news_quality(): for ranking "Go deeper", how people on Hooked listened to and rated some episodes and shows.
--    Totals only, for the server (it runs with the owner's rights; listening history stays closed to the app).
-- 3. story_follows: "Follow this story". Your own rows only. A daily job (/api/cron/news-follows) adds a notification
--    when a news show covers a story you follow (type 'story').

create table public.news_picks (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (char_length(trim(topic)) between 1 and 80),
  action text not null check (action in ('pin', 'block')),
  episode_ref text references public.episodes (id) on delete cascade,
  show_ref text references public.shows (id) on delete cascade,
  note text,
  added_at timestamptz not null default now(),
  check ((episode_ref is not null) <> (show_ref is not null)),
  check (action = 'block' or episode_ref is not null)
);
alter table public.news_picks enable row level security;
-- No policies: only the server (service key) reads it.
revoke all on public.news_picks from anon, authenticated;

create function public.news_quality(episode_refs text[], show_refs text[])
returns table (kind text, ref text, listeners int, finished int, ratings int, avg_rating real)
language sql stable security definer set search_path = '' as $$
  select 'episode', e.ref,
         (select count(distinct l.user_id) from public.listening_sessions l where l.episode_ref = e.ref)::int,
         (select count(distinct l.user_id) from public.listening_sessions l where l.episode_ref = e.ref and l.finished)::int,
         (select count(*) from public.logs g where g.episode_ref = e.ref and g.rating > 0)::int,
         (select avg(g.rating) from public.logs g where g.episode_ref = e.ref and g.rating > 0)::real
  from unnest(coalesce(episode_refs, '{}')) as e(ref)
  union all
  select 'show', s.ref,
         (select count(distinct l.user_id) from public.listening_sessions l
            join public.episodes x on x.id = l.episode_ref where x.show_id = s.ref)::int,
         (select count(distinct l.user_id) from public.listening_sessions l
            join public.episodes x on x.id = l.episode_ref where x.show_id = s.ref and l.finished)::int,
         (select count(*) from public.logs g join public.episodes x on x.id = g.episode_ref
            where x.show_id = s.ref and g.rating > 0)::int,
         (select avg(g.rating) from public.logs g join public.episodes x on x.id = g.episode_ref
            where x.show_id = s.ref and g.rating > 0)::real
  from unnest(coalesce(show_refs, '{}')) as s(ref);
$$;
revoke execute on function public.news_quality(text[], text[]) from public, anon, authenticated;
grant execute on function public.news_quality(text[], text[]) to service_role;

create table public.story_follows (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  topic_key text not null check (topic_key ~ '^[a-z0-9 ]{2,80}$'),   -- the story's name in plain lower case
  topic text not null check (char_length(topic) between 1 and 80),   -- as shown
  created_at timestamptz not null default now(),
  notified_at timestamptz,                                           -- the newest episode we told you about
  primary key (user_id, topic_key)
);
alter table public.story_follows enable row level security;
create policy "story follows own" on public.story_follows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.story_follows from anon;
grant select, insert, update, delete on public.story_follows to authenticated;

-- A new kind of notification: a news show covered a story you follow (title = the story, body = the episode's title).
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'rec', 'comment', 'reply', 'reaction', 'story'));
