-- New reactions: great take · agree · disagree · adding it.
-- Converts the old ones (same → agree, ooh → great take). Safe to run more than once.
alter table public.reactions drop constraint if exists reactions_kind_check;
update public.reactions r set kind = 'agree'
  where kind = 'same' and not exists (
    select 1 from public.reactions x where x.log_user_id = r.log_user_id and x.episode_id = r.episode_id and x.user_id = r.user_id and x.kind = 'agree');
update public.reactions r set kind = 'great'
  where kind = 'ooh' and not exists (
    select 1 from public.reactions x where x.log_user_id = r.log_user_id and x.episode_id = r.episode_id and x.user_id = r.user_id and x.kind = 'great');
delete from public.reactions where kind in ('same', 'ooh');
alter table public.reactions add constraint reactions_kind_check check (kind in ('great', 'agree', 'disagree', 'adding'));
create index if not exists reactions_episode on public.reactions (episode_id);
create index if not exists comments_episode on public.comments (episode_id);
