-- Adds "interests" to profiles: the topics someone picks in the taste picker.
-- Safe to run more than once.
alter table public.profiles add column if not exists interests jsonb not null default '[]'::jsonb;
create index if not exists logs_feed on public.logs (feed_id);
