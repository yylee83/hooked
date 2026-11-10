-- "Trending conversations" on Home: the episodes people on Hooked are talking about most.
-- Counts reviews (logs with a hook line), replies and in-app sends from the past week. Each person counts once
-- per episode, with their newest activity counting fully and half as much every 2 days after. Replying to your own
-- review doesn't count. An episode needs at least 2 people, and each show gets at most one row.
-- Sends are private, so this runs with the owner's rights and returns only totals: never who sent what.

create function public.trending_conversations(max_rows int default 3)
returns table (
  episode_ref text, title text, image_url text, show_id text, show_title text, show_image text,
  reviews int, replies int, sends int, people int, score real,
  top_user_id uuid, top_handle text, top_hook text, top_rating real
)
language sql stable security definer set search_path = '' as $$
  with events as (
    select l.episode_ref, l.user_id as actor, l.logged_at as at, 'review' as kind, false as own
    from public.logs l
    where coalesce(btrim(l.hook), '') <> '' and l.logged_at > now() - interval '7 days'
    union all
    select c.episode_ref, c.author_id, c.created_at, 'reply', c.author_id = c.log_user_id
    from public.comments c
    where c.created_at > now() - interval '7 days'
    union all
    select r.episode_ref, r.from_id, r.created_at, 'send', false
    from public.recommendations r
    where r.created_at > now() - interval '7 days'
  ),
  -- Each person once per episode: their newest activity, worth half as much every 48 hours.
  per_person as (
    select ev.episode_ref, ev.actor, max(power(0.5, extract(epoch from now() - ev.at) / 172800.0)) as w
    from events ev
    where not ev.own
    group by ev.episode_ref, ev.actor
  ),
  scored as (
    select pp.episode_ref, sum(pp.w)::real as score, count(*)::int as people
    from per_person pp
    group by pp.episode_ref
    having count(*) >= 2
  ),
  counts as (
    select ev.episode_ref,
           (count(*) filter (where ev.kind = 'review'))::int as reviews,
           (count(*) filter (where ev.kind = 'reply'))::int as replies,
           (count(*) filter (where ev.kind = 'send'))::int as sends
    from events ev
    group by ev.episode_ref
  ),
  ranked as (
    select s.*, e.title, e.image_url, e.show_id,
           row_number() over (partition by e.show_id order by s.score desc) as nth_in_show
    from scored s
    join public.episodes e on e.id = s.episode_ref
  )
  select r.episode_ref, r.title, r.image_url, r.show_id, sh.title, sh.image_url,
         c.reviews, c.replies, c.sends, r.people, r.score,
         top.user_id, top.handle, top.hook, top.rating
  from ranked r
  join public.shows sh on sh.id = r.show_id
  join counts c on c.episode_ref = r.episode_ref
  -- The episode's best review overall, scored as episode pages do (reviewScore in lib/social.js):
  -- "+" 3, thumbs up 2 (older "great"/"same"/"ooh" too), thumbs down 1, each reply 1.5, a longer hook up to 2.
  left join lateral (
    select l.user_id, p.handle, l.hook, l.rating
    from public.logs l
    join public.profiles p on p.id = l.user_id
    where l.episode_ref = r.episode_ref and p.handle is not null and coalesce(btrim(l.hook), '') <> ''
    order by (
      select coalesce(sum(case when x.kind = 'adding' then 3 when x.kind = 'disagree' then 1 else 2 end), 0)
      from public.reactions x where x.log_user_id = l.user_id and x.episode_ref = l.episode_ref
    ) + 1.5 * (
      select count(*) from public.comments y where y.log_user_id = l.user_id and y.episode_ref = l.episode_ref
    ) + least(2, char_length(l.hook) / 80.0) desc, l.logged_at desc
    limit 1
  ) top on true
  where r.nth_in_show = 1
  order by r.score desc
  limit greatest(1, least(coalesce(max_rows, 3), 10));
$$;

revoke execute on function public.trending_conversations(int) from public;
grant execute on function public.trending_conversations(int) to anon, authenticated;
