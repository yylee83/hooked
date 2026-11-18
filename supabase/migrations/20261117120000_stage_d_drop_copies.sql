-- Stage D step 2: logs, sends, Up next and hooked shows stop keeping their own copies of episode and
-- show details. Every page already reads them from our episodes and shows (stage D prep), and every
-- save already carries our id (stage D step 1, /api/catalog/ensure). Notifications keep theirs: each is
-- a snapshot of that moment.
--
-- Before: a save without our id made the database build the episode from the copied details.
-- After: a save without our id is refused, and new notifications take the title from our episodes.
-- If any row is still missing its id, the first block stops the migration and nothing changes.

do $$
begin
  if exists (select 1 from public.list_items where episode_ref is null) then
    raise exception 'Stage D: some Up next items have no episode id; fix them before dropping the copies';
  end if;
end;
$$;

-- ---------- the save triggers that built entries from the copies ----------
drop trigger fill_refs on public.logs;
drop trigger fill_refs on public.recommendations;
drop trigger fill_refs on public.list_items;
drop trigger fill_refs on public.hooked_shows;
drop trigger fill_refs on public.comments;
drop trigger fill_refs on public.reactions;
drop function public.fill_refs_logs();
drop function public.fill_refs_recommendations();
drop function public.fill_refs_list_items();
drop function public.fill_refs_hooked_shows();
drop function public.fill_refs_thread();
-- The one-off fill-in from the copies (stages A to C).
drop function public.backfill_refs();
-- Kept: episode_ref_for / show_ref_for (brief items still use them, through fill_refs_briefs), and
-- fill_refs_lookup on notifications (notifications keep their Podcast Index number).

-- ---------- replies and reactions: only our id ----------
-- Dropping episode_id also drops the old (log_user_id, episode_id) links to logs and their indexes;
-- the links by our id (comments_log_ref_fkey, reactions_log_ref_fkey) stay.
alter table public.comments drop column episode_id;
alter table public.reactions drop column episode_id;

-- ---------- the copies ----------
alter table public.logs
  drop column episode_id, drop column title, drop column feed_id, drop column feed_title,
  drop column image, drop column feed_image, drop column audio, drop column duration;
alter table public.recommendations
  drop column episode_id, drop column title, drop column feed_id, drop column feed_title,
  drop column image, drop column audio, drop column duration;
alter table public.list_items
  drop column episode_id, drop column title, drop column feed_id, drop column feed_title, drop column image;
-- Up next holds episodes only (every way to add one saves our episode id).
alter table public.list_items alter column episode_ref set not null;
alter table public.hooked_shows drop column feed_id, drop column title, drop column image;

-- ---------- notifications take the episode from our tables ----------
create or replace function public.notify_rec() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, title, body)
  select new.to_id, new.from_id, 'rec', e.podcastindex_id, new.episode_ref, e.title, left(coalesce(new.note, new.hook), 140)
  from episodes e where e.id = new.episode_ref;
  return new;
end;
$$;

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep_title text;
  ep_number bigint;
begin
  select title, podcastindex_id into ep_title, ep_number from episodes where id = new.episode_ref;
  -- Tell the person whose log it is.
  if new.author_id <> new.log_user_id then
    insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
    values (new.log_user_id, new.author_id, 'comment', ep_number, new.episode_ref, new.log_user_id, ep_title, left(new.body, 140));
  end if;
  -- Tell everyone else already in the conversation.
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
  select distinct c.author_id, new.author_id, 'reply', ep_number, new.episode_ref, new.log_user_id, ep_title, left(new.body, 140)
  from comments c
  where c.log_user_id = new.log_user_id and c.episode_ref = new.episode_ref
    and c.author_id <> new.author_id and c.author_id <> new.log_user_id;
  return new;
end;
$$;

create or replace function public.notify_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep_title text;
  ep_number bigint;
begin
  if new.user_id = new.log_user_id then
    return new;
  end if;
  select title, podcastindex_id into ep_title, ep_number from episodes where id = new.episode_ref;
  -- One unread reaction notice per person per log, so toggling doesn't spam.
  delete from notifications
  where user_id = new.log_user_id and actor_id = new.user_id and type = 'reaction'
    and episode_ref = new.episode_ref and read_at is null;
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
  values (new.log_user_id, new.user_id, 'reaction', ep_number, new.episode_ref, new.log_user_id, ep_title, new.kind);
  return new;
end;
$$;

-- `create or replace` keeps the earlier revokes, but say it again so this file stands on its own.
revoke execute on function public.notify_rec() from public, anon, authenticated;
revoke execute on function public.notify_comment() from public, anon, authenticated;
revoke execute on function public.notify_reaction() from public, anon, authenticated;
