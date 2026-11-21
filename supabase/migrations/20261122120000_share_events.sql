-- Shares, inside and outside Hooked (Erin, 2026-11-22), for the team and for trending.
-- Inside: sending an episode to friends was already saved (recommendations). Outside: each tap on "Share anywhere"
-- (the phone's share menu, Copy link, Messages, Email, WhatsApp, X) for an episode or a brief is now saved in
-- share_events. Like listening and search history: signed-in people only, written through record_share, never read
-- back by the app (no table grants). Erin and YY read the insights_shares_* views in Supabase. Kept a year
-- (prune_history). What we can't know: whether the message was actually sent after the app opened, or who got it.
-- Both trending functions now count an outside share of an episode as sharing, the same as an in-app send.

create table public.share_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('episode', 'brief')),
  episode_ref text references public.episodes (id) on delete cascade,
  brief_id uuid references public.briefs (id) on delete cascade,  -- a listener's brief
  brief_slug text check (brief_slug ~ '^[a-z0-9-]{1,80}$'),        -- a built-in brief (they live in the code, /briefs/<slug>)
  method text not null check (method in ('share_menu', 'copy', 'messages', 'email', 'whatsapp', 'x')),
  with_review boolean not null default false,   -- the shared message included their own stars or hook line
  created_at timestamptz not null default now(),
  check ((kind = 'episode' and episode_ref is not null and brief_id is null and brief_slug is null)
      or (kind = 'brief' and episode_ref is null and num_nonnulls(brief_id, brief_slug) = 1))
);
create index share_events_episode on public.share_events (episode_ref, created_at desc) where episode_ref is not null;
create index share_events_created on public.share_events (created_at);
create index share_events_user on public.share_events (user_id, created_at desc);

alter table public.share_events enable row level security;
-- No policies and no grants: the app's roles can't read or change this table directly.
revoke all on public.share_events from anon, authenticated;

-- Save one share. Taps on the same thing the same way within 10 seconds count once, and at most 200 a day per person
-- are kept, so a stuck button can't flood trending.
create function public.record_share(p_kind text, p_ref text, p_method text, p_with_review boolean default false)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  ep text;
  br uuid;
  slug text;
begin
  if me is null or p_method not in ('share_menu', 'copy', 'messages', 'email', 'whatsapp', 'x') then return; end if;
  if p_kind = 'episode' then
    select e.id into ep from public.episodes e where e.id = left(coalesce(p_ref, ''), 8);
    if ep is null then return; end if;
  elsif p_kind = 'brief' and coalesce(p_ref, '') ~ '^[0-9a-fA-F-]{36}$' then
    select b.id into br from public.briefs b where b.id = p_ref::uuid;
    if br is null then return; end if;
  elsif p_kind = 'brief' and coalesce(p_ref, '') ~ '^[a-z0-9-]{1,80}$' then
    slug := p_ref;
  else
    return;
  end if;
  if exists (
    select 1 from public.share_events s
    where s.user_id = me and s.method = p_method and s.created_at > now() - interval '10 seconds'
      and s.episode_ref is not distinct from ep and s.brief_id is not distinct from br and s.brief_slug is not distinct from slug
  ) then return; end if;
  if (select count(*) from public.share_events s where s.user_id = me and s.created_at > now() - interval '1 day') >= 200 then return; end if;
  insert into public.share_events (user_id, kind, episode_ref, brief_id, brief_slug, method, with_review)
  values (me, p_kind, ep, br, slug, p_method, coalesce(p_with_review, false));
end $$;

revoke execute on function public.record_share(text, text, text, boolean) from public, anon;
grant execute on function public.record_share(text, text, text, boolean) to authenticated;

-- Forget anything older than a year (the daily job calls this with the service key).
create or replace function public.prune_history() returns void language sql volatile security definer set search_path = '' as $$
  delete from public.listening_sessions where started_at < now() - interval '1 year';
  delete from public.search_events where created_at < now() - interval '1 year';
  delete from public.share_events where created_at < now() - interval '1 year';
$$;
revoke execute on function public.prune_history() from public, anon, authenticated;
grant execute on function public.prune_history() to service_role;

-- ---------- trending: outside shares count as sharing ----------

create or replace function public.trending_episodes(max_rows int default 10)
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
    select s.episode_ref, s.user_id, s.created_at, 'send'
    from public.share_events s
    where s.created_at > now() - interval '14 days' and s.episode_ref is not null
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

create or replace function public.trending_conversations(max_rows int default 3)
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
    union all
    select s.episode_ref, s.user_id, s.created_at, 'send', false
    from public.share_events s
    where s.created_at > now() - interval '7 days' and s.episode_ref is not null
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

-- ---------- reading (Erin and YY, in the Supabase dashboard) ----------

-- Shares per day for the past 90 days. Inside: in-app sends (one send to three friends is 1 share, 3 recipients).
-- Outside: taps on Share anywhere, by how.
create view public.insights_shares_daily with (security_invoker = true) as
with inside as (
  select date_trunc('day', r.created_at)::date as day, r.from_id, r.episode_ref, date_trunc('minute', r.created_at) as at,
         count(*) as recipients
  from public.recommendations r
  where r.created_at > now() - interval '90 days'
  group by 1, 2, 3, 4
)
select d.day,
       coalesce(i.shares, 0)::int as inside_shares,
       coalesce(i.recipients, 0)::int as inside_recipients,
       coalesce(i.people, 0)::int as inside_people,
       coalesce(o.shares, 0)::int as outside_shares,
       coalesce(o.people, 0)::int as outside_people,
       coalesce(o.share_menu, 0)::int as via_share_menu,
       coalesce(o.copy, 0)::int as via_copy_link,
       coalesce(o.messages, 0)::int as via_messages,
       coalesce(o.email, 0)::int as via_email,
       coalesce(o.whatsapp, 0)::int as via_whatsapp,
       coalesce(o.x, 0)::int as via_x,
       coalesce(o.briefs, 0)::int as outside_brief_shares
from (
  select day from inside
  union select date_trunc('day', s.created_at)::date from public.share_events s where s.created_at > now() - interval '90 days'
) d
left join (
  select day, count(*) as shares, sum(recipients) as recipients, count(distinct from_id) as people from inside group by day
) i on i.day = d.day
left join (
  select date_trunc('day', s.created_at)::date as day, count(*) as shares, count(distinct s.user_id) as people,
         count(*) filter (where s.method = 'share_menu') as share_menu, count(*) filter (where s.method = 'copy') as copy,
         count(*) filter (where s.method = 'messages') as messages, count(*) filter (where s.method = 'email') as email,
         count(*) filter (where s.method = 'whatsapp') as whatsapp, count(*) filter (where s.method = 'x') as x,
         count(*) filter (where s.kind = 'brief') as briefs
  from public.share_events s
  where s.created_at > now() - interval '90 days'
  group by 1
) o on o.day = d.day
order by d.day desc;

-- The most shared episodes in the past 30 days, inside and outside Hooked.
create view public.insights_shares_top with (security_invoker = true) as
with inside as (
  select r.episode_ref, count(distinct (r.from_id, date_trunc('minute', r.created_at))) as shares,
         count(*) as recipients, array_agg(distinct r.from_id) as people
  from public.recommendations r
  where r.created_at > now() - interval '30 days'
  group by r.episode_ref
),
outside as (
  select s.episode_ref, count(*) as shares, array_agg(distinct s.user_id) as people,
         count(*) filter (where s.with_review) as with_review
  from public.share_events s
  where s.created_at > now() - interval '30 days' and s.episode_ref is not null
  group by s.episode_ref
)
select e.title as episode, sh.title as show, e.id as episode_ref,
       coalesce(i.shares, 0)::int as inside_shares, coalesce(i.recipients, 0)::int as inside_recipients,
       coalesce(o.shares, 0)::int as outside_shares, coalesce(o.with_review, 0)::int as outside_with_review,
       (coalesce(i.shares, 0) + coalesce(o.shares, 0))::int as total_shares,
       (select count(distinct p) from unnest(coalesce(i.people, '{}') || coalesce(o.people, '{}')) p)::int as people
from (select episode_ref from inside union select episode_ref from outside) x
join public.episodes e on e.id = x.episode_ref
join public.shows sh on sh.id = e.show_id
left join inside i on i.episode_ref = x.episode_ref
left join outside o on o.episode_ref = x.episode_ref
order by total_shares desc, people desc;

revoke all on public.insights_shares_daily, public.insights_shares_top from anon, authenticated;
