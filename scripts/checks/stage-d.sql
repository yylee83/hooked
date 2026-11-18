-- Checks for stage D step 2 (the copied columns go). Run with scripts/rehearse-migrations.mjs.
-- "Person A" and "person B" are the two oldest profiles in the copy. Each check is rolled back afterwards.

-- check: the copies are gone, and notifications kept theirs
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and ((table_name in ('logs', 'recommendations', 'list_items')
            and column_name in ('episode_id', 'title', 'feed_id', 'feed_title', 'image', 'feed_image', 'audio', 'duration'))
        or (table_name = 'hooked_shows' and column_name in ('feed_id', 'title', 'image'))
        or (table_name in ('comments', 'reactions') and column_name = 'episode_id'))) then
    raise exception 'a copied column is still there';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'notifications' and column_name in ('episode_id', 'title')) <> 2 then
    raise exception 'notifications lost their snapshot columns';
  end if;
end $$;

-- check: every log, send, Up next item and hooked show still finds its episode or show
do $$ begin
  if exists (select 1 from public.logs l left join public.episodes e on e.id = l.episode_ref where e.id is null)
    or exists (select 1 from public.recommendations r left join public.episodes e on e.id = r.episode_ref where e.id is null)
    or exists (select 1 from public.list_items i left join public.episodes e on e.id = i.episode_ref where e.id is null)
    or exists (select 1 from public.hooked_shows h left join public.shows s on s.id = h.show_ref where s.id is null) then
    raise exception 'a row lost its episode or show';
  end if;
end $$;

-- check: logging, queueing, sending and hooking by our id still work for a signed-in person
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.logs (episode_ref, hooked, rating, hook)
  values ((select id from public.episodes order by id limit 1), true, 4, 'Great hour')
  on conflict (user_id, episode_ref) do update set rating = excluded.rating;
insert into public.list_items (item_key, episode_ref)
  values ((select id from public.episodes order by id offset 1 limit 1), (select id from public.episodes order by id offset 1 limit 1))
  on conflict (user_id, item_key) do nothing;
insert into public.recommendations (to_id, episode_ref, note)
  values ((select id from public.profiles order by created_at offset 1 limit 1), (select id from public.episodes order by id limit 1), 'For you');
insert into public.hooked_shows (show_ref) values ((select id from public.shows order by id limit 1)) on conflict do nothing;

-- check: a save without our id is refused (the database no longer builds entries from copies)
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
do $$ begin
  begin
    insert into public.logs (hooked) values (true);
    raise exception 'a log without episode_ref was saved';
  exception when not_null_violation then null;
  end;
  begin
    insert into public.list_items (item_key) values ('no-episode');
    raise exception 'an Up next item without episode_ref was saved';
  exception when not_null_violation then null;
  end;
end $$;

-- check: a send, a reply and a reaction notify with the title from our episodes
insert into public.shows (id, title, source) values ('tstshowd', 'Stage D Show', 'feed');
insert into public.episodes (id, show_id, title, podcastindex_id, source) values ('tstepisd', 'tstshowd', 'Stage D Episode', 999999999001, 'feed');
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.logs (episode_ref, hooked, rating) values ('tstepisd', true, 5);
reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at offset 1 limit 1), true);
set local role authenticated;
insert into public.comments (log_user_id, episode_ref, body) values ((select id from public.profiles order by created_at limit 1), 'tstepisd', 'So good');
insert into public.reactions (log_user_id, episode_ref, kind) values ((select id from public.profiles order by created_at limit 1), 'tstepisd', 'agree');
insert into public.recommendations (to_id, episode_ref, note) values ((select id from public.profiles order by created_at limit 1), 'tstepisd', 'Listen');
reset role;
do $$ declare a uuid := (select id from public.profiles order by created_at limit 1); begin
  if (select count(*) from public.notifications
      where user_id = a and episode_ref = 'tstepisd' and title = 'Stage D Episode' and episode_id = 999999999001
        and type in ('comment', 'reaction', 'rec')) <> 3 then
    raise exception 'notifications are missing the episode title or number';
  end if;
end $$;

-- check: deleting a log still takes its replies and reactions with it
insert into public.shows (id, title, source) values ('tstshowe', 'Stage D Show 2', 'feed');
insert into public.episodes (id, show_id, title, source) values ('tstepise', 'tstshowe', 'Stage D Episode 2', 'feed');
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.logs (episode_ref, hooked) values ('tstepise', false);
reset role;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at offset 1 limit 1), true);
set local role authenticated;
insert into public.comments (log_user_id, episode_ref, body) values ((select id from public.profiles order by created_at limit 1), 'tstepise', 'Hm');
insert into public.reactions (log_user_id, episode_ref, kind) values ((select id from public.profiles order by created_at limit 1), 'tstepise', 'disagree');
reset role;
delete from public.logs where episode_ref = 'tstepise';
do $$ begin
  if exists (select 1 from public.comments where episode_ref = 'tstepise') or exists (select 1 from public.reactions where episode_ref = 'tstepise') then
    raise exception 'replies or reactions outlived their log';
  end if;
end $$;
