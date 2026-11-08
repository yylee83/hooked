-- Step 8: listening sync. Where you stopped in each episode, saved to your account, so you can pick
-- up on another device. Until now this lived only in the browser you listened on (lib/progress.js),
-- which still keeps its own copy and works the same when you're signed out.
--
-- One row per person per episode. The player box on any device shows your newest row, if that row is
-- still "in the player" (closing the player or finishing an episode turns that off).

create table public.listening_progress (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  episode_ref text not null references public.episodes (id) on delete cascade,
  position int not null default 0 check (position >= 0),   -- seconds in; 0 means start from the top
  duration int check (duration >= 0),                      -- seconds, as the player saw it
  in_player boolean not null default false,                -- was this the episode in your player?
  -- Set by the device that saved it, not by the database: a device catching up later (say, after
  -- signing in) sends its own older time, so it can't jump ahead of something newer from another device.
  updated_at timestamptz not null default now(),
  primary key (user_id, episode_ref)
);

-- "What did I play last?": your newest row.
create index listening_progress_recent on public.listening_progress (user_id, updated_at desc);
-- Episodes are deleted rarely, but the cascade above needs this to be quick.
create index listening_progress_episode on public.listening_progress (episode_ref);

-- Private: only you can see or change your own rows. Friends see "Listening now" through profiles,
-- as before.
alter table public.listening_progress enable row level security;
create policy "progress own" on public.listening_progress for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.listening_progress to authenticated;
revoke all on public.listening_progress from anon;
