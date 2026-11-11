-- "Log it?" after listening: episodes you finished in Hooked's player but haven't logged, saved to your account so
-- the "Finished, not logged" list on My log is the same on every device (lib/finished.js, lib/finished-sync.js).
-- Each device keeps its own copy too, which is all there is when you're signed out.
--
-- One row per person per episode. A row waits on My log for 3 days; skipped rows are kept for 30 days so the episode
-- isn't asked about again. The app removes rows once they're past that, and when you log the episode.

create table public.finished_episodes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  episode_ref text not null references public.episodes (id) on delete cascade,
  finished_at timestamptz not null default now(),
  skipped boolean not null default false,
  -- Set by the device that made the change, so the newest change wins (as in listening_progress).
  updated_at timestamptz not null default now(),
  primary key (user_id, episode_ref)
);

-- Episodes are deleted rarely, but the cascade above needs this to be quick.
create index finished_episodes_episode on public.finished_episodes (episode_ref);

-- Private: only you can see or change your own rows.
alter table public.finished_episodes enable row level security;
create policy "finished own" on public.finished_episodes for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.finished_episodes to authenticated;
revoke all on public.finished_episodes from anon;
