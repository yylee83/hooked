-- Listening and search history, for the Hooked team only (Erin and YY read it in Supabase).
-- What people play in Hooked's player and what they search for, so we can see what people like and drop, where they
-- lose interest, how well search works, and which topics could become briefs. Signed-in people only.
--
-- Private by design: the app adds rows through record_listen / record_search / record_search_tap and can't read any
-- back, not even a person's own. There are no table grants for the app's roles. The insights_* views at the end are
-- for reading in the Supabase dashboard. Rows are kept for a year (prune_history, run by the daily job).
-- Matching between people is a separate thing and uses public logs only (docs/PLAN.md, "Decided 2026-11-11").

-- One row per time someone plays an episode: from pressing play until they stop, switch episodes or leave.
create table public.listening_sessions (
  id uuid primary key,                                         -- made by the app, so a session can be updated as it goes
  user_id uuid not null references public.profiles (id) on delete cascade,
  episode_ref text not null references public.episodes (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  start_position int not null default 0 check (start_position >= 0),   -- seconds into the episode
  end_position int not null default 0 check (end_position >= 0),       -- where they stopped
  max_position int not null default 0 check (max_position >= 0),       -- furthest they got
  duration int check (duration > 0),                                   -- the episode's length, as the player saw it
  heard_seconds int not null default 0 check (heard_seconds >= 0),     -- time actually played (skips not counted)
  skipped_seconds int not null default 0 check (skipped_seconds >= 0), -- total jumped forward
  finished boolean not null default false,                             -- reached the last minute
  source text not null default 'other' check (source in
    ('up_next', 'search', 'home', 'episode', 'show', 'brief', 'profile', 'my_log', 'resume', 'other'))
);
create index listening_sessions_user on public.listening_sessions (user_id, started_at desc);
create index listening_sessions_started on public.listening_sessions (started_at);
create index listening_sessions_episode on public.listening_sessions (episode_ref);

-- One row per search: the words, the filter, how many results, and the first result tapped (if any).
create table public.search_events (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  query text not null check (char_length(query) between 1 and 200),
  filter text not null default 'all' check (filter in ('all', 'episodes', 'shows', 'friends', 'people', 'briefs')),
  shows int not null default 0 check (shows >= 0),
  episodes int not null default 0 check (episodes >= 0),
  people int not null default 0 check (people >= 0),
  briefs int not null default 0 check (briefs >= 0),
  created_at timestamptz not null default now(),
  tapped_kind text check (tapped_kind in ('episode', 'show', 'person', 'brief')),
  tapped_ref text check (char_length(tapped_ref) <= 200),   -- our id, a handle or a brief id
  tapped_position int check (tapped_position >= 1),         -- 1 = the first result on the page
  tapped_at timestamptz
);
create index search_events_created on public.search_events (created_at);
create index search_events_user on public.search_events (user_id, created_at desc);

alter table public.listening_sessions enable row level security;
alter table public.search_events enable row level security;
-- No policies and no grants: the app's roles can't read or change these tables directly.
revoke all on public.listening_sessions from anon, authenticated;
revoke all on public.search_events from anon, authenticated;

-- ---------- writing (the app) ----------

-- Save or update one listening session. Only for the signed-in person's own sessions; signed out, nothing happens.
create function public.record_listen(
  p_id uuid, p_episode_ref text, p_started_at timestamptz, p_ended_at timestamptz,
  p_start_position int, p_end_position int, p_max_position int, p_duration int,
  p_heard_seconds int, p_skipped_seconds int, p_finished boolean, p_source text
) returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_id is null or p_episode_ref is null then return; end if;
  insert into public.listening_sessions as s (id, user_id, episode_ref, started_at, ended_at, start_position,
    end_position, max_position, duration, heard_seconds, skipped_seconds, finished, source)
  values (p_id, (select auth.uid()), p_episode_ref, p_started_at, greatest(p_ended_at, p_started_at),
    greatest(0, coalesce(p_start_position, 0)), greatest(0, coalesce(p_end_position, 0)),
    greatest(0, coalesce(p_max_position, 0)), nullif(greatest(0, coalesce(p_duration, 0)), 0),
    greatest(0, coalesce(p_heard_seconds, 0)), greatest(0, coalesce(p_skipped_seconds, 0)), coalesce(p_finished, false),
    case when p_source in ('up_next', 'search', 'home', 'episode', 'show', 'brief', 'profile', 'my_log', 'resume')
      then p_source else 'other' end)
  on conflict (id) do update set
    ended_at = greatest(excluded.ended_at, s.ended_at),
    end_position = excluded.end_position,
    max_position = greatest(excluded.max_position, s.max_position),
    duration = coalesce(excluded.duration, s.duration),
    heard_seconds = greatest(excluded.heard_seconds, s.heard_seconds),
    skipped_seconds = greatest(excluded.skipped_seconds, s.skipped_seconds),
    finished = s.finished or excluded.finished
  where s.user_id = (select auth.uid());
end $$;

-- Save one search.
create function public.record_search(
  p_id uuid, p_query text, p_filter text, p_shows int, p_episodes int, p_people int, p_briefs int
) returns void language plpgsql volatile security definer set search_path = '' as $$
declare q text := left(btrim(coalesce(p_query, '')), 200);
begin
  if (select auth.uid()) is null or p_id is null or q = '' then return; end if;
  insert into public.search_events (id, user_id, query, filter, shows, episodes, people, briefs)
  values (p_id, (select auth.uid()), q,
    case when p_filter in ('all', 'episodes', 'shows', 'friends', 'people', 'briefs') then p_filter else 'all' end,
    greatest(0, coalesce(p_shows, 0)), greatest(0, coalesce(p_episodes, 0)),
    greatest(0, coalesce(p_people, 0)), greatest(0, coalesce(p_briefs, 0)))
  on conflict (id) do nothing;
end $$;

-- Note the first result tapped after a search.
create function public.record_search_tap(p_id uuid, p_kind text, p_ref text, p_position int)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_kind not in ('episode', 'show', 'person', 'brief') then return; end if;
  update public.search_events
  set tapped_kind = p_kind, tapped_ref = left(p_ref, 200), tapped_position = greatest(1, coalesce(p_position, 1)), tapped_at = now()
  where id = p_id and user_id = (select auth.uid()) and tapped_at is null;
end $$;

revoke execute on function public.record_listen(uuid, text, timestamptz, timestamptz, int, int, int, int, int, int, boolean, text) from public;
revoke execute on function public.record_search(uuid, text, text, int, int, int, int) from public;
revoke execute on function public.record_search_tap(uuid, text, text, int) from public;
grant execute on function public.record_listen(uuid, text, timestamptz, timestamptz, int, int, int, int, int, int, boolean, text) to authenticated;
grant execute on function public.record_search(uuid, text, text, int, int, int, int) to authenticated;
grant execute on function public.record_search_tap(uuid, text, text, int) to authenticated;

-- Forget anything older than a year (the daily job calls this with the service key).
create function public.prune_history() returns void language sql volatile security definer set search_path = '' as $$
  delete from public.listening_sessions where started_at < now() - interval '1 year';
  delete from public.search_events where created_at < now() - interval '1 year';
$$;
revoke execute on function public.prune_history() from public;
grant execute on function public.prune_history() to service_role;

-- ---------- reading (Erin and YY, in the Supabase dashboard) ----------
-- Each view answers one question over recent activity. They read the tables as whoever opens them, so the app's
-- roles get nothing from them either.

-- Which shows people finish and which they drop (past 90 days), and the same by episode length.
-- One line per person per episode: did they ever finish it, and how far did they get.
create view public.insights_finish_rate with (security_invoker = true) as
with per_listen as (
  select l.user_id, l.episode_ref, bool_or(l.finished) as finished,
         max(l.max_position)::numeric / nullif(max(l.duration), 0) as furthest, max(l.duration) as duration
  from public.listening_sessions l
  where l.started_at > now() - interval '90 days'
  group by l.user_id, l.episode_ref
)
select 'show' as grouped_by, sh.title as name, count(*)::int as listens, count(distinct p.user_id)::int as people,
       round(100.0 * avg(p.finished::int))::int as finished_pct, round(100.0 * avg(least(p.furthest, 1)))::int as avg_furthest_pct
from per_listen p join public.episodes e on e.id = p.episode_ref join public.shows sh on sh.id = e.show_id
group by sh.title
union all
select 'length', case when p.duration < 1200 then 'under 20 min' when p.duration < 2700 then '20–45 min'
                      when p.duration < 5400 then '45–90 min' else 'over 90 min' end,
       count(*)::int, count(distinct p.user_id)::int,
       round(100.0 * avg(p.finished::int))::int, round(100.0 * avg(least(p.furthest, 1)))::int
from per_listen p where p.duration is not null
group by 2
order by grouped_by desc, listens desc;

-- Where in an episode people stop, for listens they didn't finish (past 90 days), in 10% steps, per show.
create view public.insights_dropoff with (security_invoker = true) as
with per_listen as (
  select l.user_id, l.episode_ref, bool_or(l.finished) as finished,
         max(l.max_position)::numeric / nullif(max(l.duration), 0) as furthest
  from public.listening_sessions l
  where l.started_at > now() - interval '90 days'
  group by l.user_id, l.episode_ref
)
select sh.title as show, (least(floor(p.furthest * 10), 9) * 10)::int || '–' || (least(floor(p.furthest * 10), 9) * 10 + 10)::int || '%' as stopped_at,
       count(*)::int as listens
from per_listen p join public.episodes e on e.id = p.episode_ref join public.shows sh on sh.id = e.show_id
where not p.finished and p.furthest is not null
group by sh.title, least(floor(p.furthest * 10), 9)
order by sh.title, least(floor(p.furthest * 10), 9);

-- How much each person listens each week (past 26 weeks), to see who's drifting away.
create view public.insights_listening_trend with (security_invoker = true) as
select pr.handle, date_trunc('week', l.started_at)::date as week,
       round(sum(l.heard_seconds) / 60.0)::int as minutes, count(distinct l.episode_ref)::int as episodes,
       count(distinct l.episode_ref) filter (where l.finished)::int as finished
from public.listening_sessions l join public.profiles pr on pr.id = l.user_id
where l.started_at > now() - interval '26 weeks'
group by pr.handle, date_trunc('week', l.started_at)
order by pr.handle, week desc;

-- The most searched words, this week and this month.
create view public.insights_top_searches with (security_invoker = true) as
select lower(s.query) as query,
       count(*) filter (where s.created_at > now() - interval '7 days')::int as searches_7d,
       count(*)::int as searches_30d, count(distinct s.user_id)::int as people_30d,
       round(100.0 * avg((s.tapped_at is not null)::int))::int as tapped_pct
from public.search_events s
where s.created_at > now() - interval '30 days'
group by lower(s.query)
order by searches_30d desc, people_30d desc;

-- Searches that missed (past 90 days): mostly no tap, or the tap was far down the list.
create view public.insights_search_misses with (security_invoker = true) as
select lower(s.query) as query, s.filter, count(*)::int as searches, count(distinct s.user_id)::int as people,
       count(*) filter (where s.tapped_at is null)::int as no_tap,
       round(avg(s.tapped_position), 1) as avg_tap_position,
       max(s.shows + s.episodes + s.people + s.briefs) as most_results, max(s.created_at) as last_searched
from public.search_events s
where s.created_at > now() - interval '90 days'
group by lower(s.query), s.filter
having avg((s.tapped_at is null)::int) >= 0.5 or avg(s.tapped_position) > 5
order by people desc, searches desc;

-- Topics two or more people searched for this month that no brief covers yet (by title or topic).
-- Built-in briefs live in the code (lib/briefs-server.js), not here, so check those by eye.
create view public.insights_brief_ideas with (security_invoker = true) as
select lower(s.query) as query, count(distinct s.user_id)::int as people, count(*)::int as searches,
       round(100.0 * avg((s.tapped_at is null)::int))::int as no_tap_pct
from public.search_events s
where s.created_at > now() - interval '30 days' and s.filter not in ('people')
  and not exists (
    select 1 from public.briefs b
    where b.title ilike '%' || lower(s.query) || '%' or b.topic ilike '%' || lower(s.query) || '%'
  )
group by lower(s.query)
having count(distinct s.user_id) >= 2
order by people desc, searches desc;

revoke all on public.insights_finish_rate, public.insights_dropoff, public.insights_listening_trend,
  public.insights_top_searches, public.insights_search_misses, public.insights_brief_ideas from anon, authenticated;
