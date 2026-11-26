-- @mentions in replies (YY, 2026-11-26), like Letterboxd: type @handle in a reply to pull a friend into the
-- conversation. The person mentioned gets a 'mention' notification (the bell, and the notification email).
--
-- * Up to 5 different people per reply; yourself and the review's author (who already hears about every reply) don't count.
-- * Someone mentioned isn't also sent the "also replied" notice for the same reply: one notice is enough.
-- * Blocks hold: notifications_skip_blocked (20261124200000) drops a notice between two people when either blocked
--   the other, so a blocked person can't reach you by mentioning you.
-- * Only new replies notify. Replies can't be edited, so there is no update case.

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow', 'rec', 'comment', 'reply', 'reaction', 'topic', 'mention'));

-- The people a piece of text mentions: @handle at the start or after a space or punctuation (so an email address
-- like ana@site.com isn't a mention). A trailing dot ends the sentence, not the handle ("thanks @ana.").
create function public.mentioned_ids(body text) returns setof uuid
language sql stable security definer set search_path = public
as $$
  with raw as (
    select distinct lower(m[2]) as h
    from regexp_matches(coalesce(body, ''), '(^|[^a-z0-9._@])@([a-z0-9._]{2,24})', 'gi') as m
  )
  select p.id
  from raw
  join public.profiles p on lower(p.handle) = raw.h or lower(p.handle) = rtrim(raw.h, '.')
  group by p.id
$$;
revoke execute on function public.mentioned_ids(text) from public, anon, authenticated;

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep_title text;
  ep_number bigint;
  tagged uuid[];
begin
  select title, podcastindex_id into ep_title, ep_number from episodes where id = new.episode_ref;
  select coalesce(array_agg(id), '{}') into tagged
  from (
    select id from public.mentioned_ids(new.body) as id
    where id <> new.author_id and id <> new.log_user_id
    limit 5
  ) t;

  -- Tell the person whose log it is.
  if new.author_id <> new.log_user_id then
    insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
    values (new.log_user_id, new.author_id, 'comment', ep_number, new.episode_ref, new.log_user_id, ep_title, left(new.body, 140));
  end if;
  -- Tell the people mentioned.
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
  select t, new.author_id, 'mention', ep_number, new.episode_ref, new.log_user_id, ep_title, left(new.body, 140)
  from unnest(tagged) as t;
  -- Tell everyone else already in the conversation.
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
  select distinct c.author_id, new.author_id, 'reply', ep_number, new.episode_ref, new.log_user_id, ep_title, left(new.body, 140)
  from comments c
  where c.log_user_id = new.log_user_id and c.episode_ref = new.episode_ref
    and c.author_id <> new.author_id and c.author_id <> new.log_user_id
    and not (c.author_id = any (tagged));
  return new;
end;
$$;
revoke execute on function public.notify_comment() from public, anon, authenticated;
