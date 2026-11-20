-- Your own listening, for Wrapped and My log (YY, 2026-11-20: stats come from what you actually play in Hooked's
-- player, with your logs underneath).
--
-- listening_sessions stays closed to the app (20261112120000_listening_search_history.sql): no table grants, no
-- policies. This one function hands the signed-in person totals of their own sessions, and nobody else's. It returns
-- totals and highlights only (no list of sessions, no search history).
--
-- p_tz is the person's time zone (from their browser, e.g. 'America/New_York'), so "your big listening day" and the
-- time of day are theirs. An unknown time zone falls back to UTC.

create function public.my_listening(p_tz text default 'UTC')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  tz text := 'UTC';
  result jsonb;
begin
  if me is null then return null; end if;
  begin
    perform now() at time zone p_tz;
    tz := p_tz;
  exception when others then
    tz := 'UTC';
  end;

  with mine as (
    select l.episode_ref, l.heard_seconds, l.finished, l.started_at, l.started_at at time zone tz as local_start,
           e.show_id, e.published_at, coalesce(e.duration_seconds, l.duration) as length
    from public.listening_sessions l
    join public.episodes e on e.id = l.episode_ref
    where l.user_id = me and l.heard_seconds > 0
  ),
  per_show as (
    select m.show_id, sum(m.heard_seconds)::int as seconds, count(distinct m.episode_ref)::int as episodes
    from mine m where m.show_id is not null
    group by m.show_id
    order by seconds desc
    limit 80
  ),
  -- each episode once
  per_episode as (
    select m.episode_ref, min(m.started_at) as first_play, max(m.published_at) as published_at, max(m.length) as length
    from mine m group by m.episode_ref
  ),
  per_day as (
    select local_start::date as day, sum(heard_seconds)::int as seconds from mine group by 1
  ),
  -- runs of days in a row with some listening
  runs as (
    select day, day - (row_number() over (order by day))::int as run from per_day
  ),
  -- the most episodes of one show you played in a single day
  binge as (
    select m.show_id, m.local_start::date as day, count(distinct m.episode_ref)::int as episodes
    from mine m group by 1, 2 order by episodes desc, day desc limit 1
  ),
  -- the show categories you spent your time in (from Podcast Index or the show's feed), weighted by time
  cats as (
    select c.name, sum(p.seconds)::int as seconds
    from per_show p join public.shows s on s.id = p.show_id
    cross join lateral jsonb_array_elements_text(case when jsonb_typeof(s.categories) = 'array' then s.categories else '[]'::jsonb end) as c(name)
    group by c.name order by seconds desc limit 12
  )
  select jsonb_build_object(
    'seconds', coalesce((select sum(heard_seconds) from mine), 0)::int,
    'episodes', (select count(distinct episode_ref) from mine)::int,
    'finished', (select count(distinct episode_ref) from mine where finished)::int,
    'since', (select min(local_start) from mine),
    -- seconds listened on each day of the week, Sunday first
    'days', (select jsonb_agg(coalesce(d.seconds, 0) order by g.dow)
             from generate_series(0, 6) g(dow)
             left join (select extract(dow from local_start)::int as dow, sum(heard_seconds)::int as seconds
                        from mine group by 1) d on d.dow = g.dow),
    -- seconds listened in each hour of the day, midnight first
    'hours', (select jsonb_agg(coalesce(h.seconds, 0) order by g.hr)
              from generate_series(0, 23) g(hr)
              left join (select extract(hour from local_start)::int as hr, sum(heard_seconds)::int as seconds
                         from mine group by 1) h on h.hr = g.hr),
    'shows', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', p.show_id, 'title', s.title, 'image', s.image_url,
                         'podcastindex_id', s.podcastindex_id, 'seconds', p.seconds, 'episodes', p.episodes)
                       order by p.seconds desc)
                       from per_show p join public.shows s on s.id = p.show_id), '[]'::jsonb),
    'oldest', (select jsonb_build_object('id', e.id, 'title', e.title, 'show', s.title, 'published_at', e.published_at)
               from per_episode p join public.episodes e on e.id = p.episode_ref join public.shows s on s.id = e.show_id
               where p.published_at is not null order by p.published_at limit 1),
    -- the length of episodes you pick (middle value, seconds)
    'typical_length', (select round(percentile_cont(0.5) within group (order by length))::int from per_episode where length > 0),
    'listening_days', (select count(*) from per_day)::int,
    'streak', coalesce((select max(n) from (select count(*)::int as n from runs group by run) r), 0),
    'best_day', (select jsonb_build_object('day', day, 'seconds', seconds) from per_day order by seconds desc, day desc limit 1),
    'binge', (select jsonb_build_object('show', s.title, 'id', s.id, 'episodes', b.episodes, 'day', b.day)
              from binge b join public.shows s on s.id = b.show_id where b.episodes >= 2),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'seconds', seconds) order by seconds desc) from cats), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Signed-in people only (Supabase lets the app's roles run new functions unless they're named here).
revoke execute on function public.my_listening(text) from public, anon;
grant execute on function public.my_listening(text) to authenticated;
