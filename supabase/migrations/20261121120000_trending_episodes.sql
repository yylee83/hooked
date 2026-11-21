-- "Trending episodes" on Home (Erin, 2026-11-21): the episodes with the most going on lately, as a swipe row.
-- Counts five kinds of activity from the past 14 days: logs, replies (not on your own review), in-app sends, thumbs and
-- "+" on someone else's review, and adds to Up next. Each person counts once per episode for each kind, so one busy
-- person can't carry an episode. Sends count 3, logs and replies 2, thumbs, "+" and Up next adds 1, and everything is
-- worth half as much every 4 days. Episodes 2 or more people are into come first; the rest fill in after. Each show gets
-- at most one row.
-- Sends and Up next are private, so this runs with the owner's rights and returns only totals: never who did what.

create function public.trending_episodes(max_rows int default 10)
returns table (
  episode_ref text, title text, image_url text, audio_url text, duration_seconds int,
  show_id text, show_title text, show_image text,
  people int, logs int, replies int, sends int, score real
)
language sql stable security definer set search_path = '' as $$
  with events as (
    select l.episode_ref, l.user_id as actor, l.logged_at as at, 'log' as kind
    from public.logs l
    where l.logged_at > now() - interval '14 days'
    union all
    select c.episode_ref, c.author_id, c.created_at, 'reply'
    from public.comments c
    where c.created_at > now() - interval '14 days' and c.author_id <> c.log_user_id
    union all
    select r.episode_ref, r.from_id, r.created_at, 'send'
    from public.recommendations r
    where r.created_at > now() - interval '14 days'
    union all
    select x.episode_ref, x.user_id, x.created_at, 'reaction'
    from public.reactions x
    where x.created_at > now() - interval '14 days' and x.user_id <> x.log_user_id
    union all
    select i.episode_ref, i.user_id, i.created_at, 'queue'
    from public.list_items i
    where i.created_at > now() - interval '14 days'
  ),
  -- Each person once per episode and kind: their newest, worth half as much every 4 days.
  per_kind as (
    select ev.episode_ref, ev.actor, ev.kind, max(power(0.5, extract(epoch from now() - ev.at) / 345600.0)) as w
    from events ev
    where ev.episode_ref is not null
    group by ev.episode_ref, ev.actor, ev.kind
  ),
  scored as (
    select pk.episode_ref,
           sum(pk.w * case pk.kind when 'send' then 3 when 'log' then 2 when 'reply' then 2 else 1 end)::real as score,
           count(distinct pk.actor)::int as people
    from per_kind pk
    group by pk.episode_ref
  ),
  counts as (
    select ev.episode_ref,
           (count(*) filter (where ev.kind = 'log'))::int as logs,
           (count(*) filter (where ev.kind = 'reply'))::int as replies,
           (count(*) filter (where ev.kind = 'send'))::int as sends
    from events ev
    group by ev.episode_ref
  ),
  ranked as (
    select s.*, e.title, e.image_url, e.audio_url, e.duration_seconds, e.show_id,
           row_number() over (partition by e.show_id order by (s.people >= 2) desc, s.score desc) as nth_in_show
    from scored s
    join public.episodes e on e.id = s.episode_ref
  )
  select r.episode_ref, r.title, r.image_url, r.audio_url, r.duration_seconds,
         r.show_id, sh.title, sh.image_url,
         r.people, c.logs, c.replies, c.sends, r.score
  from ranked r
  join public.shows sh on sh.id = r.show_id
  join counts c on c.episode_ref = r.episode_ref
  where r.nth_in_show = 1
  order by (r.people >= 2) desc, r.score desc
  limit greatest(1, least(coalesce(max_rows, 10), 20));
$$;

revoke execute on function public.trending_episodes(int) from public;
grant execute on function public.trending_episodes(int) to anon, authenticated;
