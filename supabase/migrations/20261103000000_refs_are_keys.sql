-- Step 7, stage C3 part 2: our episode id becomes the key.
-- Logs, sends, replies, reactions and notifications must point at our episode (episode_ref). The
-- Podcast Index number (episode_id) becomes optional, so episodes Podcast Index doesn't have can be
-- logged. The old columns stay filled when there is a number; stage D removes them.
-- If any row is still missing its reference, the "set not null" lines stop the whole migration
-- and nothing changes.

-- Catch anything saved without a reference since the last fill-in.
select public.backfill_refs();

-- ---------- logs and sends ----------
alter table public.logs alter column episode_ref set not null;
alter table public.logs alter column episode_id drop not null;

-- A re-save that leaves out the Podcast Index number keeps the one we have, instead of losing the reference.
create or replace function public.fill_refs_logs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.episode_id is null then
    new.episode_id := old.episode_id;
  end if;
  if new.episode_ref is null or (tg_op = 'UPDATE' and new.episode_id is distinct from old.episode_id) then
    new.episode_ref := public.episode_ref_for(new.episode_id, new.feed_id, new.title, new.feed_title,
                                              new.image, new.feed_image, new.audio, new.duration);
  end if;
  return new;
end;
$$;

alter table public.recommendations alter column episode_ref set not null;
alter table public.recommendations alter column episode_id drop not null;

-- ---------- replies and reactions: attached to a log by our id ----------
-- They take whichever id is missing from the log they belong to.
create function public.fill_refs_thread() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.episode_ref is null and new.episode_id is not null then
    select episode_ref into new.episode_ref from public.logs
    where user_id = new.log_user_id and episode_id = new.episode_id;
  elsif new.episode_id is null and new.episode_ref is not null then
    select episode_id into new.episode_id from public.logs
    where user_id = new.log_user_id and episode_ref = new.episode_ref;
  end if;
  return new;
end;
$$;
revoke execute on function public.fill_refs_thread() from public, anon, authenticated;

drop trigger fill_refs on public.comments;
drop trigger fill_refs on public.reactions;
create trigger fill_refs before insert on public.comments for each row execute function public.fill_refs_thread();
create trigger fill_refs before insert on public.reactions for each row execute function public.fill_refs_thread();

alter table public.comments alter column episode_ref set not null;
alter table public.comments alter column episode_id drop not null;
alter table public.comments add constraint comments_log_ref_fkey
  foreign key (log_user_id, episode_ref) references public.logs (user_id, episode_ref) on delete cascade on update cascade;
create index comments_log_ref on public.comments (log_user_id, episode_ref, created_at);

alter table public.reactions drop constraint reactions_pkey;
alter table public.reactions alter column episode_ref set not null;
alter table public.reactions alter column episode_id drop not null;
alter table public.reactions add primary key (log_user_id, episode_ref, user_id, kind);
alter table public.reactions add constraint reactions_log_ref_fkey
  foreign key (log_user_id, episode_ref) references public.logs (user_id, episode_ref) on delete cascade on update cascade;

-- ---------- Up next: one item per episode, keyed by our id ----------
-- (Items for a whole show, or saved without an episode, keep their old key.)
delete from public.list_items
where (user_id, item_key) in (
  select user_id, item_key from (
    select user_id, item_key,
           row_number() over (partition by user_id, episode_ref order by created_at, item_key) as n
    from public.list_items where episode_ref is not null
  ) dup where n > 1
);
update public.list_items set item_key = episode_ref
where episode_ref is not null and item_key <> episode_ref;

-- ---------- notifications follow our id ----------
create or replace function public.notify_rec() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, title, body)
  values (new.to_id, new.from_id, 'rec', new.episode_id, new.episode_ref, new.title, left(coalesce(new.note, new.hook), 140));
  return new;
end;
$$;

create or replace function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep_title text;
begin
  select title into ep_title from logs where user_id = new.log_user_id and episode_ref = new.episode_ref;
  -- Tell the person whose log it is.
  if new.author_id <> new.log_user_id then
    insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
    values (new.log_user_id, new.author_id, 'comment', new.episode_id, new.episode_ref, new.log_user_id, ep_title, left(new.body, 140));
  end if;
  -- Tell everyone else already in the conversation.
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
  select distinct c.author_id, new.author_id, 'reply', new.episode_id, new.episode_ref, new.log_user_id, ep_title, left(new.body, 140)
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
begin
  if new.user_id = new.log_user_id then
    return new;
  end if;
  select title into ep_title from logs where user_id = new.log_user_id and episode_ref = new.episode_ref;
  -- One unread reaction notice per person per log, so toggling doesn't spam.
  delete from notifications
  where user_id = new.log_user_id and actor_id = new.user_id and type = 'reaction'
    and episode_ref = new.episode_ref and read_at is null;
  insert into notifications (user_id, actor_id, type, episode_id, episode_ref, log_user_id, title, body)
  values (new.log_user_id, new.user_id, 'reaction', new.episode_id, new.episode_ref, new.log_user_id, ep_title, new.kind);
  return new;
end;
$$;

-- These only work as triggers; they shouldn't be callable through the API.
revoke execute on function public.notify_follow() from public, anon, authenticated;
revoke execute on function public.notify_rec() from public, anon, authenticated;
revoke execute on function public.notify_comment() from public, anon, authenticated;
revoke execute on function public.notify_reaction() from public, anon, authenticated;
