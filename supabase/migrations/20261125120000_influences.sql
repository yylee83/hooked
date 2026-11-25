-- "Your reach": how much your reviews and sends move other people (Erin, 2026-11-24; design in
-- docs/superpowers/specs/2026-11-24-influence-stats-design.md).
--
-- influences keeps one row each time someone was influenced by you: they tapped + on your review ('review'), or they
-- put an episode you sent them on their Up next ('send'). Up next rows disappear once an episode is played, and sends
-- disappear on "Not for me", so neither can be counted later; this table keeps the moment. The database fills it
-- itself (triggers), whichever screen the + or the queue happens on.
--
-- Closed to the app: no policies, no grants. my_reach() hands the signed-in person their own two totals (never names),
-- and Erin and YY read insights_influence in Supabase, which also counts "listened" (logged it afterwards).

create table public.influences (
  influencer_id uuid not null references public.profiles (id) on delete cascade,  -- whose review or send it was
  user_id uuid not null references public.profiles (id) on delete cascade,        -- who was influenced
  episode_ref text not null references public.episodes (id) on delete cascade,
  via text not null check (via in ('review', 'send')),
  created_at timestamptz not null default now(),
  primary key (influencer_id, user_id, episode_ref, via),
  check (influencer_id <> user_id)
);
create index influences_user_episode on public.influences (user_id, episode_ref);
alter table public.influences enable row level security;
revoke all on public.influences from anon, authenticated;

-- + on someone else's review: credit the reviewer. Untapping takes the credit back.
create function public.influence_from_reaction() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'adding' and new.user_id is not null and new.user_id <> new.log_user_id then
      insert into public.influences (influencer_id, user_id, episode_ref, via)
      values (new.log_user_id, new.user_id, new.episode_ref, 'review')
      on conflict do nothing;
    end if;
    return new;
  end if;
  if old.kind = 'adding' then
    delete from public.influences
    where influencer_id = old.log_user_id and user_id = old.user_id and episode_ref = old.episode_ref and via = 'review';
  end if;
  return old;
end $$;
create trigger influence_from_reaction after insert or delete on public.reactions
  for each row execute function public.influence_from_reaction();

-- An episode goes on someone's Up next: credit everyone who sent it to them. Nothing undoes this: playing it (which
-- takes it off Up next) or dismissing the send later doesn't change that they queued it.
create function public.influence_from_queue() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.influences (influencer_id, user_id, episode_ref, via)
  select distinct r.from_id, new.user_id, new.episode_ref, 'send'
  from public.recommendations r
  where r.to_id = new.user_id and r.episode_ref = new.episode_ref and r.from_id is not null and r.from_id <> new.user_id
  on conflict do nothing;
  return new;
end $$;
create trigger influence_from_queue after insert on public.list_items
  for each row execute function public.influence_from_queue();

revoke execute on function public.influence_from_reaction() from public, anon, authenticated;
revoke execute on function public.influence_from_queue() from public, anon, authenticated;

-- Your own totals: people = different people you've influenced; added = different (person, episode) pairs, so the
-- same friend reached by your review and your send for one episode counts once.
create function public.my_reach() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'people', count(distinct i.user_id),
    'added', count(distinct (i.user_id, i.episode_ref))
  )
  from public.influences i
  where i.influencer_id = (select auth.uid());
$$;
revoke execute on function public.my_reach() from public, anon;
grant execute on function public.my_reach() to authenticated;

-- For Erin and YY (read in Supabase): who moves other people's listening. listened = the person logged the episode
-- after the moment you influenced them.
create view public.insights_influence with (security_invoker = true) as
with per as (
  select i.influencer_id, i.user_id, i.episode_ref,
         min(i.created_at) as first_at,
         bool_or(i.via = 'review') as by_review,
         bool_or(i.via = 'send') as by_send
  from public.influences i
  group by i.influencer_id, i.user_id, i.episode_ref
), scored as (
  select per.*, exists (
    select 1 from public.logs l
    where l.user_id = per.user_id and l.episode_ref = per.episode_ref and l.logged_at > per.first_at
  ) as listened
  from per
)
select p.handle,
       count(distinct s.user_id)::int as people,
       count(*)::int as added,
       count(*) filter (where s.listened)::int as listened,
       count(distinct s.user_id) filter (where s.listened)::int as listened_people,
       count(*) filter (where s.by_review)::int as via_review,
       count(*) filter (where s.by_send)::int as via_send,
       (select count(*) from public.follows f where f.followee_id = p.id)::int as followers
from scored s
join public.profiles p on p.id = s.influencer_id
group by p.id, p.handle
order by listened desc, added desc;
revoke all on public.insights_influence from anon, authenticated;

-- What happened before today. Every + on someone else's review still standing, dated with the +. Every send the person
-- went on to log (at or after the send), dated with the send. Sends that were only queued can't be found: queuing
-- wasn't recorded, and Up next rows are gone once played.
insert into public.influences (influencer_id, user_id, episode_ref, via, created_at)
select r.log_user_id, r.user_id, r.episode_ref, 'review', r.created_at
from public.reactions r
where r.kind = 'adding' and r.user_id is not null and r.user_id <> r.log_user_id
on conflict do nothing;

insert into public.influences (influencer_id, user_id, episode_ref, via, created_at)
select r.from_id, r.to_id, r.episode_ref, 'send', min(r.created_at)
from public.recommendations r
where r.from_id is not null and r.from_id <> r.to_id
  and exists (select 1 from public.logs l where l.user_id = r.to_id and l.episode_ref = r.episode_ref and l.logged_at >= r.created_at)
group by r.from_id, r.to_id, r.episode_ref
on conflict do nothing;
