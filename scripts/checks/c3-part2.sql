-- Checks for stage C3 part 2 (our episode id becomes the key). Run with scripts/rehearse-migrations.mjs.
-- "Person A" and "person B" are the two oldest profiles in the copy. Each check is rolled back afterwards.

-- check: every saved row has our episode id, and Up next is keyed by it
do $$ begin
  if exists (select 1 from public.logs where episode_ref is null)
    or exists (select 1 from public.recommendations where episode_ref is null)
    or exists (select 1 from public.comments where episode_ref is null)
    or exists (select 1 from public.reactions where episode_ref is null) then
    raise exception 'a row is missing episode_ref';
  end if;
  if exists (select 1 from public.list_items where episode_ref is not null and item_key <> episode_ref) then
    raise exception 'an Up next item is not keyed by episode_ref';
  end if;
end $$;

-- check: an episode Podcast Index doesn't have can be logged, replied to, reacted to, sent and queued
insert into public.shows (id, title, source) values ('tstshow2', 'Only on Spotify', 'spotify');
insert into public.episodes (id, show_id, title, source) values ('tstepis2', 'tstshow2', 'A Spotify-only episode', 'spotify');
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.logs (episode_ref, title, hooked, rating) values ('tstepis2', 'A Spotify-only episode', true, 4);
insert into public.logs (episode_ref, title, hooked, rating) values ('tstepis2', 'A Spotify-only episode', false, 3)
  on conflict (user_id, episode_ref) do update set hooked = excluded.hooked, rating = excluded.rating;
reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at offset 1 limit 1), true);
set local role authenticated;
insert into public.comments (log_user_id, episode_ref, body)
  values ((select id from public.profiles order by created_at limit 1), 'tstepis2', 'Loved this one');
insert into public.reactions (log_user_id, episode_ref, kind)
  values ((select id from public.profiles order by created_at limit 1), 'tstepis2', 'agree');
insert into public.recommendations (to_id, episode_ref, title)
  values ((select id from public.profiles order by created_at limit 1), 'tstepis2', 'A Spotify-only episode');
insert into public.list_items (item_key, episode_ref, title) values ('tstepis2', 'tstepis2', 'A Spotify-only episode');
do $$ begin
  insert into public.reactions (log_user_id, episode_ref, kind)
    values ((select id from public.profiles order by created_at limit 1), 'tstepis2', 'agree');
  raise exception 'the same reaction was saved twice';
exception when unique_violation then null;
end $$;
reset role;
do $$
declare a uuid := (select id from public.profiles order by created_at limit 1);
begin
  if (select count(*) from public.logs where episode_ref = 'tstepis2') <> 1 then raise exception 'saving twice made two logs'; end if;
  if (select rating from public.logs where episode_ref = 'tstepis2') <> 3 then raise exception 'the second save did not update the log'; end if;
  if (select count(*) from public.comments where episode_ref = 'tstepis2' and episode_id is null) <> 1 then raise exception 'reply not saved'; end if;
  if (select count(*) from public.notifications where user_id = a and episode_ref = 'tstepis2') <> 3 then
    raise exception 'expected 3 notifications (reply, reaction, send), got %',
      (select count(*) from public.notifications where user_id = a and episode_ref = 'tstepis2');
  end if;
  if (select title from public.notifications where user_id = a and type = 'comment' and episode_ref = 'tstepis2') <> 'A Spotify-only episode' then
    raise exception 'reply notification is missing the episode title';
  end if;
end $$;

-- check: saves that only know the Podcast Index number still work (the app before this change)
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at offset 1 limit 1), true);
set local role authenticated;
insert into public.comments (log_user_id, episode_id, body)
  select user_id, episode_id, 'Old-style reply' from public.logs
  where user_id = (select id from public.profiles order by created_at limit 1) and episode_id is not null
  order by logged_at desc limit 1;
reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.logs (episode_id, feed_id, title, hooked)
  select episode_id, feed_id, title, true from public.logs
  where user_id = (select id from public.profiles order by created_at limit 1) and episode_id is not null
  order by logged_at desc limit 1
  on conflict (user_id, episode_ref) do update set hooked = excluded.hooked;
reset role;
do $$
declare
  a uuid := (select id from public.profiles order by created_at limit 1);
  l record;
begin
  select * into l from public.logs where user_id = a and episode_id is not null order by logged_at desc limit 1;
  if (select count(*) from public.logs where user_id = a and episode_id = l.episode_id) <> 1 then raise exception 'an old-style save duplicated the log'; end if;
  if not exists (select 1 from public.comments where log_user_id = a and body = 'Old-style reply' and episode_ref = l.episode_ref) then
    raise exception 'old-style reply did not get our episode id';
  end if;
  if not exists (select 1 from public.notifications where user_id = a and type = 'comment' and episode_ref = l.episode_ref and body = 'Old-style reply') then
    raise exception 'old-style reply notification did not get our episode id';
  end if;
end $$;

-- check: re-saving a log without its Podcast Index number keeps it
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.logs (episode_id, episode_ref, title, hooked)
  select null, episode_ref, title, false from public.logs
  where user_id = (select id from public.profiles order by created_at limit 1) and episode_id is not null
  order by logged_at desc limit 1
  on conflict (user_id, episode_ref) do update set episode_id = excluded.episode_id, hooked = excluded.hooked;
reset role;
do $$ begin
  if exists (select 1 from public.logs where user_id = (select id from public.profiles order by created_at limit 1)
             and episode_id is null and episode_ref in (select id from public.episodes where podcastindex_id is not null)) then
    raise exception 'the re-save lost the Podcast Index number';
  end if;
end $$;

-- check: deleting a log removes its replies and reactions
select set_config('request.jwt.claim.sub', (select log_user_id::text from public.reactions limit 1), true);
set local role authenticated;
delete from public.logs where (user_id, episode_ref) in (select log_user_id, episode_ref from public.reactions limit 1);
reset role;
do $$ begin
  if exists (select 1 from public.reactions r where not exists (select 1 from public.logs l where l.user_id = r.log_user_id and l.episode_ref = r.episode_ref))
    or exists (select 1 from public.comments c where not exists (select 1 from public.logs l where l.user_id = c.log_user_id and l.episode_ref = c.episode_ref)) then
    raise exception 'replies or reactions were left behind';
  end if;
end $$;

-- check: the notification functions can't be called through the API
do $$ begin
  if has_function_privilege('anon', 'public.notify_rec()', 'execute')
    or has_function_privilege('authenticated', 'public.notify_comment()', 'execute')
    or has_function_privilege('authenticated', 'public.notify_reaction()', 'execute')
    or has_function_privilege('anon', 'public.notify_follow()', 'execute') then
    raise exception 'a notify function is callable';
  end if;
end $$;
