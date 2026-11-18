-- Decision 6, step 1: "hooked" is for shows; stars rate episodes.
-- Logging an episode no longer asks "Are you hooked?", so a log's answer becomes optional (new logs leave it empty).
-- One-time catch-up: every show someone logged an episode of as hooked becomes one of their hooked shows, dated by their
-- first hooked log of it. Shows already hooked are left as they are; nothing is deleted. From now on a show is hooked
-- only when someone chooses it (show page, or the pill on the log sheet).
-- Safe for the app that's live before this: it always sends an answer, and hooked shows are read the same way.

alter table public.logs alter column hooked drop not null;

insert into public.hooked_shows (user_id, show_ref, created_at)
select l.user_id, e.show_id, min(l.logged_at)
from public.logs l
join public.episodes e on e.id = l.episode_ref
where l.hooked
group by l.user_id, e.show_id
on conflict (user_id, show_ref) do nothing;
