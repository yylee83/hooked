-- A private stats page for the team (YY, 2026-11-25): /stats, for Erin and YY only.
--
-- team_members lists who may see it. The app can't read or change the table (no grants, no policies); add or remove
-- someone in Supabase → Table Editor → team_members (their user id from profiles). Filled here, once, from today's
-- handles, so a later handle change can't hand the page to someone else.
--
-- team_stats() returns totals only: counts per day, the top episodes, shows and searches, and how people heard about
-- Hooked. Never emails, never who did what. Anyone else who calls it gets an error.
--
-- p_days: how many days back (1 to 365). p_tz: the viewer's time zone, so days split at their midnight; an unknown
-- time zone falls back to UTC.

create table public.team_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
revoke all on public.team_members from public, anon, authenticated;

insert into public.team_members (user_id)
select p.id from public.profiles p where p.handle in ('erin', 'kikilululee')
on conflict do nothing;

-- ---------- time in the app (YY, 2026-11-25: "what about time on site?") ----------
-- One row per signed-in person per minute they had Hooked open on screen and were using it (the app checks that the
-- page is visible and that they tapped, scrolled or typed in the last 2 minutes; components/AppTime.js). The minute
-- comes from the database clock, so two open tabs still count once. Nothing about which page. Private like listening
-- history: the app can only add its own minute, never read it back. Kept a year (prune_history).

create table public.app_minutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  minute timestamptz not null,
  primary key (user_id, minute)
);
alter table public.app_minutes enable row level security;
revoke all on public.app_minutes from public, anon, authenticated;
create index app_minutes_minute on public.app_minutes (minute);

create function public.record_app_minute()
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or not exists (select 1 from public.profiles p where p.id = me) then return; end if;
  insert into public.app_minutes (user_id, minute) values (me, date_trunc('minute', now()))
  on conflict do nothing;
end;
$$;
revoke execute on function public.record_app_minute() from public, anon, authenticated;
grant execute on function public.record_app_minute() to authenticated;

create or replace function public.prune_history() returns void language sql volatile security definer set search_path = '' as $$
  delete from public.listening_sessions where started_at < now() - interval '1 year';
  delete from public.search_events where created_at < now() - interval '1 year';
  delete from public.share_events where created_at < now() - interval '1 year';
  delete from public.app_minutes where minute < now() - interval '1 year';
$$;
revoke execute on function public.prune_history() from public, anon, authenticated;
grant execute on function public.prune_history() to service_role;

-- ---------- the stats ----------

create function public.team_stats(p_days int default 30, p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  tz text := 'UTC';
  days int := greatest(1, least(coalesce(p_days, 30), 365));
  since timestamptz;
  first_day date;
  result jsonb;
begin
  if me is null or not exists (select 1 from public.team_members t where t.user_id = me) then
    raise exception 'team only' using errcode = '42501';
  end if;
  begin
    perform now() at time zone p_tz;
    tz := p_tz;
  exception when others then
    tz := 'UTC';
  end;
  first_day := (now() at time zone tz)::date - (days - 1);
  since := first_day::timestamp at time zone tz;

  with
  -- Everything a signed-in person does that shows they were here.
  activity as (
    select user_id, logged_at as at from public.logs where logged_at >= since
    union all select author_id, created_at from public.comments where created_at >= since
    union all select user_id, created_at from public.reactions where created_at >= since
    union all select from_id, created_at from public.recommendations where created_at >= since
    union all select user_id, created_at from public.list_items where created_at >= since
    union all select follower_id, created_at from public.follows where created_at >= since
    union all select user_id, started_at from public.listening_sessions where started_at >= since
    union all select user_id, created_at from public.search_events where created_at >= since
    union all select user_id, created_at from public.share_events where created_at >= since
    union all select user_id, minute from public.app_minutes where minute >= since
  ),
  app as (
    select m.user_id, (m.minute at time zone tz)::date as day from public.app_minutes m where m.minute >= since
  ),
  plays as (
    select l.user_id, l.episode_ref, l.started_at, l.heard_seconds, l.finished
    from public.listening_sessions l
    where l.started_at >= since and l.heard_seconds > 0
  ),
  period_logs as (
    select l.user_id, l.episode_ref, l.rating, l.hook, l.logged_at from public.logs l where l.logged_at >= since
  ),
  day_list as (
    select d::date as day from generate_series(first_day, (now() at time zone tz)::date, interval '1 day') d
  ),
  daily as (
    select dl.day,
      (select count(*) from public.profiles p where (p.created_at at time zone tz)::date = dl.day)::int as signups,
      (select count(distinct a.user_id) from activity a where (a.at at time zone tz)::date = dl.day)::int as active,
      (select count(*) from period_logs l where (l.logged_at at time zone tz)::date = dl.day)::int as logs,
      (select count(*) from period_logs l where (l.logged_at at time zone tz)::date = dl.day
         and nullif(trim(l.hook), '') is not null)::int as reviews,
      (select count(*) from public.comments c where c.created_at >= since
         and (c.created_at at time zone tz)::date = dl.day)::int as replies,
      (select count(*) from plays pl where (pl.started_at at time zone tz)::date = dl.day)::int as plays,
      (select coalesce(sum(pl.heard_seconds), 0) / 60 from plays pl
         where (pl.started_at at time zone tz)::date = dl.day)::int as minutes,
      (select count(distinct pl.user_id) from plays pl where (pl.started_at at time zone tz)::date = dl.day)::int as listeners,
      (select count(*) from app a where a.day = dl.day)::int as app_minutes,
      (select count(distinct a.user_id) from app a where a.day = dl.day)::int as app_people
    from day_list dl
  ),
  ep_counts as (
    select x.episode_ref,
           count(*) filter (where x.kind = 'play')::int as plays,
           count(distinct x.user_id) filter (where x.kind = 'play')::int as listeners,
           count(*) filter (where x.kind = 'log')::int as logs,
           round(avg(x.rating) filter (where x.kind = 'log')::numeric, 1) as avg_rating
    from (
      select episode_ref, user_id, null::real as rating, 'play' as kind from plays
      union all select episode_ref, user_id, rating, 'log' from period_logs
    ) x
    where x.episode_ref is not null
    group by x.episode_ref
  ),
  top_episodes as (
    select e.id, e.title, s.title as show_title, c.plays, c.listeners, c.logs, c.avg_rating
    from ep_counts c
    join public.episodes e on e.id = c.episode_ref
    left join public.shows s on s.id = e.show_id
    order by (c.listeners + c.logs) desc, c.plays desc, e.title
    limit 10
  ),
  show_counts as (
    select e.show_id,
           sum(c.plays)::int as plays, sum(c.logs)::int as logs,
           (select coalesce(sum(pl.heard_seconds), 0) / 60 from plays pl
              join public.episodes e2 on e2.id = pl.episode_ref where e2.show_id = e.show_id)::int as minutes
    from ep_counts c
    join public.episodes e on e.id = c.episode_ref
    where e.show_id is not null
    group by e.show_id
  ),
  top_shows as (
    select s.id, s.title, sc.plays, sc.logs, sc.minutes
    from show_counts sc join public.shows s on s.id = sc.show_id
    order by sc.minutes desc, sc.logs desc, s.title
    limit 10
  ),
  top_searches as (
    select lower(trim(q.query)) as query, count(*)::int as times, count(distinct q.user_id)::int as people,
           (count(*) filter (where q.shows + q.episodes + q.people + q.briefs = 0))::int as empty
    from public.search_events q
    where q.created_at >= since
    group by 1
    order by times desc, people desc, 1
    limit 10
  ),
  heard as (
    select a.heard_from as source, count(*)::int as people
    from public.signup_answers a
    where a.heard_from is not null
    group by 1
    order by people desc
  )
  select jsonb_build_object(
    'days', days,
    'tz', tz,
    'from', first_day,
    'all_time', jsonb_build_object(
      'people', (select count(*) from public.profiles),
      'logs', (select count(*) from public.logs),
      'reviews', (select count(*) from public.logs where nullif(trim(hook), '') is not null),
      'replies', (select count(*) from public.comments),
      'follows', (select count(*) from public.follows),
      'hours', (select coalesce(sum(heard_seconds), 0) / 3600 from public.listening_sessions),
      'waitlist', (select count(*) from public.waitlist where invited_at is null)
    ),
    'period', jsonb_build_object(
      'signups', (select count(*) from public.profiles where created_at >= since),
      'active', (select count(distinct user_id) from activity),
      'logs', (select count(*) from period_logs),
      'reviews', (select count(*) from period_logs where nullif(trim(hook), '') is not null),
      'replies', (select count(*) from public.comments where created_at >= since),
      'thumbs', (select count(*) from public.reactions where created_at >= since and kind in ('agree', 'great')),
      'sends', (select count(*) from public.recommendations where created_at >= since),
      'up_next', (select count(*) from public.list_items where created_at >= since),
      'follows', (select count(*) from public.follows where created_at >= since),
      'plays', (select count(*) from plays),
      'listeners', (select count(distinct user_id) from plays),
      'minutes', (select coalesce(sum(heard_seconds), 0) / 60 from plays),
      'finishes', (select count(*) from plays where finished),
      -- per person per day: total minutes over the (person, day) pairs that had any
      'listen_person_days', (select count(*) from (select distinct user_id, (started_at at time zone tz)::date from plays) x),
      'app_minutes', (select count(*) from app),
      'app_people', (select count(distinct user_id) from app),
      'app_person_days', (select count(*) from (select distinct user_id, day from app) x),
      'shares', (select count(*) from public.share_events where created_at >= since),
      'searches', (select count(*) from public.search_events where created_at >= since),
      'invites_used', (select count(*) from public.invite_uses where created_at >= since),
      'waitlist_joins', (select count(*) from public.waitlist where created_at >= since)
    ),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'top_episodes', coalesce((select jsonb_agg(to_jsonb(t)) from top_episodes t), '[]'::jsonb),
    'top_shows', coalesce((select jsonb_agg(to_jsonb(t)) from top_shows t), '[]'::jsonb),
    'top_searches', coalesce((select jsonb_agg(to_jsonb(t)) from top_searches t), '[]'::jsonb),
    'heard_from', coalesce((select jsonb_agg(to_jsonb(h)) from heard h), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.team_stats(int, text) from public, anon, authenticated;
grant execute on function public.team_stats(int, text) to authenticated;
