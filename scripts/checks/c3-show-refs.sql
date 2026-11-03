-- Checks for stage C3 part 3b (our show id is the key for hooked shows). Run with scripts/rehearse-migrations.mjs.
-- "Person A" is the oldest profile in the copy. Each check is rolled back afterwards.

-- check: every hooked show has our show id, and nothing was lost
do $$ begin
  if exists (select 1 from public.hooked_shows where show_ref is null) then raise exception 'a hooked show is missing show_ref'; end if;
  if (select count(*) from public.hooked_shows) <> (select count(distinct (user_id, show_ref)) from public.hooked_shows) then
    raise exception 'duplicate hooked shows';
  end if;
end $$;

-- check: a show Podcast Index doesn't have can be hooked, once
insert into public.shows (id, title, source) values ('tstshow3', 'Only from its feed', 'feed');
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.hooked_shows (show_ref, title) values ('tstshow3', 'Only from its feed');
do $$ begin
  insert into public.hooked_shows (show_ref, title) values ('tstshow3', 'Only from its feed');
  raise exception 'the same show was hooked twice';
exception when unique_violation then null;
end $$;
delete from public.hooked_shows where show_ref = 'tstshow3';
reset role;
do $$ begin
  if exists (select 1 from public.hooked_shows where show_ref = 'tstshow3') then raise exception 'unhooking did not remove it'; end if;
end $$;

-- check: hooking with only the Podcast Index number still works (the app before this change)
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
delete from public.hooked_shows where feed_id = (select podcastindex_id from public.shows where podcastindex_id is not null order by id limit 1);
insert into public.hooked_shows (feed_id, title)
  select podcastindex_id, title from public.shows where podcastindex_id is not null order by id limit 1;
insert into public.hooked_shows (feed_id, title)
  select podcastindex_id, title from public.shows where podcastindex_id is not null order by id limit 1
  on conflict (user_id, feed_id) do nothing;
reset role;
do $$
declare s record;
begin
  select * into s from public.shows where podcastindex_id is not null order by id limit 1;
  if (select count(*) from public.hooked_shows where feed_id = s.podcastindex_id
      and user_id = (select id from public.profiles order by created_at limit 1)) <> 1 then
    raise exception 'old-style hook saved % rows', (select count(*) from public.hooked_shows where feed_id = s.podcastindex_id);
  end if;
  if not exists (select 1 from public.hooked_shows where feed_id = s.podcastindex_id and show_ref = s.id) then
    raise exception 'old-style hook did not get our show id';
  end if;
end $$;

-- check: re-saving a hooked show without its number keeps it
select set_config('request.jwt.claim.sub', (select user_id::text from public.hooked_shows where feed_id is not null order by user_id, show_ref limit 1), true);
set local role authenticated;
do $$
declare n int;
begin
  update public.hooked_shows set feed_id = null
    where user_id = auth.uid() and show_ref = (select show_ref from public.hooked_shows
      where user_id = auth.uid() and feed_id is not null order by show_ref limit 1);
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'expected to re-save 1 hooked show, saved %', n; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.hooked_shows h join public.shows s on s.id = h.show_ref
             where h.feed_id is null and s.podcastindex_id is not null) then
    raise exception 'the re-save lost the Podcast Index number';
  end if;
end $$;
