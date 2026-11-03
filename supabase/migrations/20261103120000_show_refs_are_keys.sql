-- Step 7, stage C3 part 3b: our show id becomes the key for hooked shows.
-- "Hooked on this?" must point at our show (show_ref). The Podcast Index number (feed_id) becomes
-- optional, so shows read from their own feed, or Spotify-only ones, can be hooked too.
-- If any row is still missing its reference, "set not null" stops the whole migration.

select public.backfill_refs();

-- A re-save that leaves out the Podcast Index number keeps the one we have.
create or replace function public.fill_refs_hooked_shows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.feed_id is null then
    new.feed_id := old.feed_id;
  end if;
  if new.show_ref is null or (tg_op = 'UPDATE' and new.feed_id is distinct from old.feed_id) then
    new.show_ref := public.show_ref_for(new.feed_id, new.title, new.image);
  end if;
  return new;
end;
$$;

-- One row per person per show, by our id. The old (person, number) pair stays unique too, so saves
-- from before this change still find their row.
alter table public.hooked_shows alter column show_ref set not null;
alter table public.hooked_shows drop constraint hooked_shows_pkey;
alter table public.hooked_shows add primary key (user_id, show_ref);
alter table public.hooked_shows alter column feed_id drop not null;
alter table public.hooked_shows add constraint hooked_shows_user_feed unique (user_id, feed_id);
