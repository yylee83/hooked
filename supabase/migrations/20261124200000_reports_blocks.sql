-- Reporting and blocking (YY, 2026-11-24).
--
-- REPORTS: anyone signed in can report a review, a reply, a list or a profile, with a reason. The report is private:
-- the app can add one but never read them back. The team reads them in Supabase (Table Editor → insights_reports, newest
-- first), and each new one is emailed to hello@hookedonpods.com (lib/report-email.js). What was reported is copied
-- into the report when it's made, so it's kept even if the person edits or deletes it afterwards.
-- To act on one, see docs/MODERATION.md. When it's dealt with, set the report's status to 'done' (or 'dismissed').
--
-- BLOCKS: you can block someone. Then:
--   * you're unfollowed both ways, their sends to you and their notifications to you are cleared;
--   * they can't follow you, reply to or react on your reviews, or send you episodes (and you can't do those to them);
--   * nothing they do notifies you;
--   * the app hides their reviews and replies from you (lib/store.js `blocked`).
-- Blocks are private: only the person who blocked can see their own list. Nobody is told.

-- ---------- blocks ----------
create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked on public.blocks (blocked_id);
alter table public.blocks enable row level security;
create policy "blocks read own" on public.blocks for select using ((select auth.uid()) = blocker_id);
create policy "blocks add own" on public.blocks for insert with check ((select auth.uid()) = blocker_id);
create policy "blocks remove own" on public.blocks for delete using ((select auth.uid()) = blocker_id);

-- Has either of these two people blocked the other? Only used inside the checks below, never by the app.
create function public.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;
revoke execute on function public.blocked_between(uuid, uuid) from public, anon, authenticated;

-- Blocking someone clears what ties you together.
create function public.blocks_after_insert() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.follows
    where (follower_id = new.blocker_id and followee_id = new.blocked_id)
       or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  delete from public.recommendations
    where (from_id = new.blocked_id and to_id = new.blocker_id)
       or (from_id = new.blocker_id and to_id = new.blocked_id);
  delete from public.notifications
    where (user_id = new.blocker_id and actor_id = new.blocked_id)
       or (user_id = new.blocked_id and actor_id = new.blocker_id);
  return null;
end;
$$;
revoke execute on function public.blocks_after_insert() from public, anon, authenticated;
create trigger blocks_clear after insert on public.blocks for each row execute function public.blocks_after_insert();

-- The checks. The app turns code HKB01 into a plain message (lib/blocks.js).
create function public.block_check() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  a uuid;
  b uuid;
begin
  if tg_table_name = 'follows' then a := new.follower_id; b := new.followee_id;
  elsif tg_table_name = 'comments' then a := new.author_id; b := new.log_user_id;
  elsif tg_table_name = 'reactions' then a := new.user_id; b := new.log_user_id;
  elsif tg_table_name = 'recommendations' then a := new.from_id; b := new.to_id;
  end if;
  if public.blocked_between(a, b) then
    raise exception 'blocked' using errcode = 'HKB01';
  end if;
  return new;
end;
$$;
revoke execute on function public.block_check() from public, anon, authenticated;
create trigger block_check before insert on public.follows for each row execute function public.block_check();
create trigger block_check before insert on public.comments for each row execute function public.block_check();
create trigger block_check before insert on public.reactions for each row execute function public.block_check();
create trigger block_check before insert on public.recommendations for each row execute function public.block_check();

-- Nothing a blocked person does notifies the person who blocked them (or the other way round), e.g. a reply in a
-- conversation you're both in.
create function public.notifications_skip_blocked() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.blocked_between(new.user_id, new.actor_id) then return null; end if;
  return new;
end;
$$;
revoke execute on function public.notifications_skip_blocked() from public, anon, authenticated;
create trigger skip_blocked before insert on public.notifications for each row execute function public.notifications_skip_blocked();

-- ---------- reports ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reporter_id uuid default auth.uid() references public.profiles (id) on delete set null,
  kind text not null check (kind in ('review', 'reply', 'list', 'profile')),
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'spoilers', 'other')),
  note text check (char_length(note) <= 500),
  -- What was reported. The app sends only the ids; the rest is filled in here from the real rows.
  reported_user_id uuid references public.profiles (id) on delete set null,
  episode_ref text,          -- review / reply: which episode
  log_user_id uuid,          -- reply: whose review the reply is under
  comment_id uuid,           -- reply
  brief_id uuid,             -- list
  reported_handle text,      -- copied at the time of the report
  content text,              -- the words as they were when reported
  link text,                 -- where it lives on the site
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  emailed_at timestamptz
);
create index reports_recent on public.reports (created_at desc);
create index reports_unsent on public.reports (created_at) where emailed_at is null;
alter table public.reports enable row level security;
-- Signed-in people can add a report of their own, and nothing else: no reading, changing or deleting.
create policy "reports add own" on public.reports for insert to authenticated with check ((select auth.uid()) = reporter_id);
revoke all on public.reports from anon, authenticated;
grant insert (kind, reason, note, reported_user_id, episode_ref, comment_id, brief_id) on public.reports to authenticated;

create function public.reports_fill() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  who uuid := auth.uid();
  owner_handle text;
  c record;
  b record;
begin
  -- The team (service role / SQL) can add a report directly; the app always reports as the signed-in person.
  if who is not null then
    new.reporter_id := who;
    new.status := 'open';
    new.emailed_at := null;
  end if;
  new.log_user_id := null; new.content := null; new.link := null; new.reported_handle := null;

  if new.kind = 'review' then
    new.comment_id := null; new.brief_id := null;
    select l.hook into new.content from public.logs l where l.user_id = new.reported_user_id and l.episode_ref = new.episode_ref;
    if not found then raise exception 'That review is gone.' using errcode = 'HKR02'; end if;
    select handle into owner_handle from public.profiles where id = new.reported_user_id;
    new.link := '/episode/' || new.episode_ref || '?from=' || coalesce(owner_handle, '') || '&talk=1#thread';
  elsif new.kind = 'reply' then
    new.brief_id := null;
    select * into c from public.comments where id = new.comment_id;
    if not found then raise exception 'That reply is gone.' using errcode = 'HKR02'; end if;
    new.reported_user_id := c.author_id; new.episode_ref := c.episode_ref; new.log_user_id := c.log_user_id; new.content := c.body;
    select handle into owner_handle from public.profiles where id = c.log_user_id;
    new.link := '/episode/' || c.episode_ref || '?from=' || coalesce(owner_handle, '') || '&talk=1#thread';
  elsif new.kind = 'list' then
    new.comment_id := null; new.episode_ref := null;
    select * into b from public.briefs where id = new.brief_id and not draft;
    if not found then raise exception 'That list is gone.' using errcode = 'HKR02'; end if;
    new.reported_user_id := b.author_id;
    new.content := b.title || coalesce(' — ' || nullif(b.dek, ''), '');
    new.link := '/lists/b/' || b.id;
  else -- profile
    new.comment_id := null; new.brief_id := null; new.episode_ref := null;
    select coalesce(nullif(display_name, ''), '') into new.content from public.profiles where id = new.reported_user_id;
    if not found then raise exception 'That person is gone.' using errcode = 'HKR02'; end if;
  end if;

  select handle into new.reported_handle from public.profiles where id = new.reported_user_id;
  if new.kind = 'profile' then new.link := '/u/' || coalesce(new.reported_handle, ''); end if;

  if who is not null then
    if new.reported_user_id = who then raise exception 'You can''t report yourself.' using errcode = 'HKR01'; end if;
    -- The same thing reported twice by the same person: keep the first, quietly.
    if exists (
      select 1 from public.reports r
      where r.reporter_id = who and r.kind = new.kind and r.status = 'open'
        and r.reported_user_id is not distinct from new.reported_user_id
        and r.episode_ref is not distinct from new.episode_ref
        and r.comment_id is not distinct from new.comment_id
        and r.brief_id is not distinct from new.brief_id
    ) then
      return null;
    end if;
    -- A generous daily cap, so the inbox can't be flooded.
    if (select count(*) from public.reports where reporter_id = who and created_at > now() - interval '1 day') >= 20 then
      raise exception 'Too many reports today. Try again tomorrow.' using errcode = 'HKR01';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.reports_fill() from public, anon, authenticated;
create trigger reports_fill before insert on public.reports for each row execute function public.reports_fill();

-- For the team, in Supabase: every report, newest first, with who reported whom and a link to it on the site.
create view public.insights_reports with (security_invoker = true) as
select
  r.created_at,
  r.status,
  r.kind,
  r.reason,
  r.reported_handle as reported,
  r.content,
  r.note,
  'https://hookedonpods.com' || r.link as link,
  p.handle as reported_by,
  r.id
from public.reports r
left join public.profiles p on p.id = r.reporter_id
order by (r.status = 'open') desc, r.created_at desc;
revoke all on public.insights_reports from anon, authenticated;
