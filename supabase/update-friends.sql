-- Hooked on: friends + sharing update.
-- In Supabase: SQL Editor → new snippet → make sure the dropdown next to Save says your database (not Logs)
-- → paste ALL of this → Run. Safe to run more than once.

-- What you're listening to right now (shown to people who follow you).
alter table public.profiles add column if not exists now_playing jsonb;
alter table public.profiles add column if not exists now_playing_at timestamptz;

-- Who follows whom.
create table if not exists public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee on public.follows (followee_id);

-- Episodes sent to a friend inside the app.
create table if not exists public.recommendations (
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
create index if not exists recommendations_to on public.recommendations (to_id, created_at desc);

alter table public.follows enable row level security;
alter table public.recommendations enable row level security;

-- Anyone can see who follows whom; you can only follow or unfollow as yourself.
drop policy if exists "follows read" on public.follows;
drop policy if exists "follows insert own" on public.follows;
drop policy if exists "follows delete own" on public.follows;
create policy "follows read" on public.follows for select using (true);
create policy "follows insert own" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows delete own" on public.follows for delete using (auth.uid() = follower_id);

-- Only the sender and the receiver can see a recommendation.
drop policy if exists "recs read own" on public.recommendations;
drop policy if exists "recs send" on public.recommendations;
drop policy if exists "recs delete own" on public.recommendations;
create policy "recs read own" on public.recommendations for select using (auth.uid() = from_id or auth.uid() = to_id);
create policy "recs send" on public.recommendations for insert with check (auth.uid() = from_id);
create policy "recs delete own" on public.recommendations for delete using (auth.uid() = from_id or auth.uid() = to_id);
