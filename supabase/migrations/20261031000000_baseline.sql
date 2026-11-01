-- Baseline: the database exactly as it was on 2026-10-31, before we started using migrations.
-- It replaces supabase/setup.sql and the update-*.sql files (see git history for those).
--
-- The live database already has all of this. This file was marked as applied there, not run.
-- It runs for real only on a new, empty database (for example a test database for previews).
-- Every later change goes in a new, numbered file in this folder.

-- ---------- tables ----------

-- One row per person. Created by the app the first time someone signs in.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (char_length(handle) between 2 and 24),
  display_name text,
  created_at timestamptz not null default now(),
  now_playing jsonb,                              -- what you're listening to right now
  now_playing_at timestamptz,
  email_digest boolean not null default true,     -- weekly email on or off
  interests jsonb not null default '[]'::jsonb    -- topics from the taste picker
);

-- Every episode someone logs: hooked or not, rating, "What's the hook?".
-- One log per person per episode. Episode and show details are copied in from Podcast Index.
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  episode_id bigint not null,
  title text not null,
  feed_id bigint,
  feed_title text,
  image text,
  feed_image text,
  audio text,
  duration int,
  hooked boolean not null,
  rating real check (rating between 0 and 5),
  hook text check (char_length(hook) <= 280),
  sent_to jsonb not null default '[]',
  logged_at timestamptz not null default now(),
  unique (user_id, episode_id)
);
create index logs_recent on public.logs (logged_at desc);
create index logs_feed on public.logs (feed_id);

-- Shows someone marked "I'm hooked on this".
create table public.hooked_shows (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  feed_id bigint not null,
  title text,
  image text,
  created_at timestamptz not null default now(),
  primary key (user_id, feed_id)
);

-- Up next: things saved for later. Private to each person.
create table public.list_items (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_key text not null,
  episode_id bigint,
  title text not null,
  feed_id bigint,
  feed_title text,
  image text,
  from_who text,
  created_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

-- Briefs: a topic with the best episodes (or clips of them) about it.
create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  dek text check (char_length(dek) <= 300),
  topic text not null,
  color text not null default 'cobalt' check (color in ('cobalt', 'bubblegum', 'butter')),
  mode text not null default 'clips' check (mode in ('clips', 'full')),
  items jsonb not null default '[]',
  total_seconds int not null default 0,
  created_at timestamptz not null default now()
);
create index briefs_recent on public.briefs (created_at desc);

-- Who follows whom.
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee on public.follows (followee_id);

-- Episodes sent to a friend inside the app.
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  episode_id bigint not null,
  title text not null,
  feed_id bigint,
  feed_title text,
  image text,
  audio text,
  duration int,
  hooked boolean,
  rating real,
  hook text,
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now()
);
create index recommendations_to on public.recommendations (to_id, created_at desc);

-- Replies under someone's log.
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  log_user_id uuid not null references public.profiles (id) on delete cascade,
  episode_id bigint not null,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  foreign key (log_user_id, episode_id) references public.logs (user_id, episode_id) on delete cascade
);
create index comments_log on public.comments (log_user_id, episode_id, created_at);
create index comments_episode on public.comments (episode_id);

-- Quick reactions on someone's log. "great" is no longer shown but older rows may have it.
create table public.reactions (
  log_user_id uuid not null references public.profiles (id) on delete cascade,
  episode_id bigint not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('great', 'agree', 'disagree', 'adding')),
  created_at timestamptz not null default now(),
  primary key (log_user_id, episode_id, user_id, kind),
  foreign key (log_user_id, episode_id) references public.logs (user_id, episode_id) on delete cascade
);
create index reactions_episode on public.reactions (episode_id);

-- Your notifications. Only the triggers below create these.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in ('follow', 'rec', 'comment', 'reply', 'reaction')),
  episode_id bigint,
  log_user_id uuid references public.profiles (id) on delete cascade,
  title text,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

-- ---------- security (row level security) ----------
-- Anyone can read profiles, logs, hooked shows, briefs, follows, comments and reactions.
-- People can only change their own rows. Up next, sends and notifications are private.

alter table public.profiles enable row level security;
alter table public.logs enable row level security;
alter table public.hooked_shows enable row level security;
alter table public.list_items enable row level security;
alter table public.briefs enable row level security;
alter table public.follows enable row level security;
alter table public.recommendations enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.notifications enable row level security;

create policy "profiles read" on public.profiles for select using (true);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "logs read" on public.logs for select using (true);
create policy "logs write own" on public.logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "hooked read" on public.hooked_shows for select using (true);
create policy "hooked write own" on public.hooked_shows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "list own" on public.list_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "briefs read" on public.briefs for select using (true);
create policy "briefs write own" on public.briefs for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

create policy "follows read" on public.follows for select using (true);
create policy "follows insert own" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows delete own" on public.follows for delete using (auth.uid() = follower_id);

create policy "recs read own" on public.recommendations for select using (auth.uid() = from_id or auth.uid() = to_id);
create policy "recs send" on public.recommendations for insert with check (auth.uid() = from_id);
create policy "recs delete own" on public.recommendations for delete using (auth.uid() = from_id or auth.uid() = to_id);

create policy "comments read" on public.comments for select using (true);
create policy "comments post own" on public.comments for insert with check (auth.uid() = author_id);
create policy "comments delete" on public.comments for delete using (auth.uid() = author_id or auth.uid() = log_user_id);

create policy "reactions read" on public.reactions for select using (true);
create policy "reactions add own" on public.reactions for insert with check (auth.uid() = user_id);
create policy "reactions remove own" on public.reactions for delete using (auth.uid() = user_id);

create policy "notifications read own" on public.notifications for select using (auth.uid() = user_id);
create policy "notifications mark own" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications clear own" on public.notifications for delete using (auth.uid() = user_id);

-- ---------- triggers that create notifications ----------

create function public.notify_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type) values (new.followee_id, new.follower_id, 'follow');
  return new;
end;
$$;
create trigger on_follow after insert on public.follows for each row execute function public.notify_follow();

create function public.notify_rec() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type, episode_id, title, body)
  values (new.to_id, new.from_id, 'rec', new.episode_id, new.title, left(coalesce(new.note, new.hook), 140));
  return new;
end;
$$;
create trigger on_rec after insert on public.recommendations for each row execute function public.notify_rec();

create function public.notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep_title text;
begin
  select title into ep_title from logs where user_id = new.log_user_id and episode_id = new.episode_id;
  -- Tell the person whose log it is.
  if new.author_id <> new.log_user_id then
    insert into notifications (user_id, actor_id, type, episode_id, log_user_id, title, body)
    values (new.log_user_id, new.author_id, 'comment', new.episode_id, new.log_user_id, ep_title, left(new.body, 140));
  end if;
  -- Tell everyone else already in the conversation.
  insert into notifications (user_id, actor_id, type, episode_id, log_user_id, title, body)
  select distinct c.author_id, new.author_id, 'reply', new.episode_id, new.log_user_id, ep_title, left(new.body, 140)
  from comments c
  where c.log_user_id = new.log_user_id and c.episode_id = new.episode_id
    and c.author_id <> new.author_id and c.author_id <> new.log_user_id;
  return new;
end;
$$;
create trigger on_comment after insert on public.comments for each row execute function public.notify_comment();

create function public.notify_reaction() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep_title text;
begin
  if new.user_id = new.log_user_id then
    return new;
  end if;
  select title into ep_title from logs where user_id = new.log_user_id and episode_id = new.episode_id;
  -- One unread reaction notice per person per log, so toggling doesn't spam.
  delete from notifications
  where user_id = new.log_user_id and actor_id = new.user_id and type = 'reaction'
    and episode_id = new.episode_id and read_at is null;
  insert into notifications (user_id, actor_id, type, episode_id, log_user_id, title, body)
  values (new.log_user_id, new.user_id, 'reaction', new.episode_id, new.log_user_id, ep_title, new.kind);
  return new;
end;
$$;
create trigger on_reaction after insert on public.reactions for each row execute function public.notify_reaction();
