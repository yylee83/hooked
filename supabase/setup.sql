-- Hooked database setup.
-- In Supabase: open your project → SQL Editor → New query → paste ALL of this → Run.
-- It's safe to run more than once.

-- Profiles: one per person. The site creates it the first time someone signs in.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text unique check (char_length(handle) between 2 and 24),
  display_name text,
  created_at timestamptz not null default now()
);

-- Logs: every episode someone logs (hooked or not, rating, "what's the hook?").
create table if not exists public.logs (
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
create index if not exists logs_recent on public.logs (logged_at desc);

-- Shows someone marked "I'm hooked on this".
create table if not exists public.hooked_shows (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  feed_id bigint not null,
  title text,
  image text,
  created_at timestamptz not null default now(),
  primary key (user_id, feed_id)
);

-- "On my list": things saved for later. Private to each person.
create table if not exists public.list_items (
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

-- Briefs people make with the + button.
create table if not exists public.briefs (
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
create index if not exists briefs_recent on public.briefs (created_at desc);

-- Security: everyone can read profiles, logs, hooked shows and briefs;
-- people can only change their own. Lists are private.
alter table public.profiles enable row level security;
alter table public.logs enable row level security;
alter table public.hooked_shows enable row level security;
alter table public.list_items enable row level security;
alter table public.briefs enable row level security;

drop policy if exists "profiles read" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "logs read" on public.logs;
drop policy if exists "logs write own" on public.logs;
create policy "logs read" on public.logs for select using (true);
create policy "logs write own" on public.logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "hooked read" on public.hooked_shows;
drop policy if exists "hooked write own" on public.hooked_shows;
create policy "hooked read" on public.hooked_shows for select using (true);
create policy "hooked write own" on public.hooked_shows for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "list own" on public.list_items;
create policy "list own" on public.list_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "briefs read" on public.briefs;
drop policy if exists "briefs write own" on public.briefs;
create policy "briefs read" on public.briefs for select using (true);
create policy "briefs write own" on public.briefs for all using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- Give everyone who already signed up a profile row (fixes "Save does nothing").
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
