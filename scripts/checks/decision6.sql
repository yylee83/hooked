-- Checks for Decision 6 step 1 (hooked is for shows). Run with scripts/rehearse-migrations.mjs.
-- Each check is rolled back afterwards.

-- check: every show someone logged as hooked is now one of their hooked shows
do $$ begin
  if exists (
    select 1 from public.logs l join public.episodes e on e.id = l.episode_ref
    where l.hooked
      and not exists (select 1 from public.hooked_shows h where h.user_id = l.user_id and h.show_ref = e.show_id)) then
    raise exception 'a show logged as hooked was not caught up';
  end if;
end $$;

-- check: the catch-up added only shows someone logged as hooked (or had hooked already), nothing else
do $$ begin
  if exists (
    select 1 from public.hooked_shows h
    where h.created_at > now() - interval '1 minute'
      and not exists (select 1 from public.logs l join public.episodes e on e.id = l.episode_ref
                      where l.user_id = h.user_id and e.show_id = h.show_ref and l.hooked)) then
    raise exception 'the catch-up hooked a show nobody logged as hooked';
  end if;
end $$;

-- check: a log can be saved with stars and no hooked answer
select set_config('request.jwt.claim.sub', (select id::text from public.profiles order by created_at limit 1), true);
set local role authenticated;
insert into public.logs (episode_ref, rating, hook)
  values ((select id from public.episodes order by id offset 3 limit 1), 4.5, 'Stars only')
  on conflict (user_id, episode_ref) do update set rating = excluded.rating, hook = excluded.hook;
reset role;
do $$ begin
  if not exists (select 1 from public.logs where hook = 'Stars only' and rating = 4.5) then
    raise exception 'a stars-only log was not saved';
  end if;
end $$;

-- check: re-saving an older log without an answer keeps the answer it had
select set_config('request.jwt.claim.sub', (select user_id::text from public.logs where hooked is not null order by logged_at limit 1), true);
set local role authenticated;
do $$ declare r record; begin
  select episode_ref, hooked into r from public.logs where user_id = auth.uid() and hooked is not null order by logged_at limit 1;
  insert into public.logs (episode_ref, rating) values (r.episode_ref, 3)
    on conflict (user_id, episode_ref) do update set rating = excluded.rating;
  if (select hooked from public.logs where user_id = auth.uid() and episode_ref = r.episode_ref) is distinct from r.hooked then
    raise exception 'an older log lost its hooked answer';
  end if;
end $$;
