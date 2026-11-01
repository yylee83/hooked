-- Trending topics over the past 48 hours.
-- Google's "Trending now" feed only covers the last few minutes, so the bar kept changing.
-- Now the server saves every topic it sees here, and the site shows the past 48 hours,
-- ranked by each topic's peak search volume.

create table public.trending_topics (
  topic_key text primary key,                    -- the topic in lower case, so repeats merge
  topic text not null,
  traffic text,                                  -- Google's label at its peak, e.g. "50K+"
  traffic_n bigint not null default 0,           -- the same as a number, for ranking
  picture text,
  news jsonb not null default '[]',              -- latest headlines about it
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index trending_topics_recent on public.trending_topics (last_seen desc);

-- Anyone can read it. Only the server (with the service key) can write, through record_trends.
alter table public.trending_topics enable row level security;
create policy "trending read" on public.trending_topics for select using (true);
grant select on public.trending_topics to anon, authenticated;
revoke insert, update, delete on public.trending_topics from anon, authenticated;

-- Save one batch from the feed: [{topic, traffic, traffic_n, picture, news}, ...].
-- Keeps each topic's peak traffic and latest headlines, and clears out anything older than a week.
create function public.record_trends(items jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.trending_topics as t (topic_key, topic, traffic, traffic_n, picture, news)
  select distinct on (lower(i ->> 'topic'))
    lower(i ->> 'topic'),
    left(i ->> 'topic', 200),
    i ->> 'traffic',
    coalesce((i ->> 'traffic_n')::bigint, 0),
    nullif(i ->> 'picture', ''),
    coalesce(i -> 'news', '[]'::jsonb)
  from jsonb_array_elements(items) as i
  where coalesce(trim(i ->> 'topic'), '') <> ''
  on conflict (topic_key) do update set
    topic = excluded.topic,
    last_seen = now(),
    traffic = case when excluded.traffic_n >= t.traffic_n then excluded.traffic else t.traffic end,
    traffic_n = greatest(t.traffic_n, excluded.traffic_n),
    picture = coalesce(excluded.picture, t.picture),
    news = case when jsonb_array_length(excluded.news) > 0 then excluded.news else t.news end;

  delete from public.trending_topics where last_seen < now() - interval '7 days';
$$;

revoke execute on function public.record_trends(jsonb) from public, anon, authenticated;
grant execute on function public.record_trends(jsonb) to service_role;
