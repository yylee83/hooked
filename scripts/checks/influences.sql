-- Checks for "Your reach" (20261125120000_influences.sql) on a copy of live: run with scripts/rehearse-migrations.mjs,
-- or paste into the SQL editor of the TEST database after the migration is pushed there. Each check raises on failure.

-- check: every + on someone else's review was counted, once
do $$ begin
  if (select count(*) from public.influences where via = 'review')
     <> (select count(*) from public.reactions where kind = 'adding' and user_id is not null and user_id <> log_user_id) then
    raise exception 'review credits do not match + taps on other people''s reviews';
  end if;
end $$;

-- check: nobody is credited for influencing themselves
do $$ begin
  if exists (select 1 from public.influences where influencer_id = user_id) then
    raise exception 'someone was credited for themselves';
  end if;
end $$;

-- check: every send credit is a send the person went on to log
do $$ begin
  if exists (
    select 1 from public.influences i
    where i.via = 'send'
      and not exists (select 1 from public.recommendations r where r.from_id = i.influencer_id and r.to_id = i.user_id and r.episode_ref = i.episode_ref)) then
    raise exception 'a send credit has no send behind it';
  end if;
end $$;

-- check: the reviewer with the most credits sees them through my_reach
do $$ declare top uuid; r jsonb; begin
  select influencer_id into top from public.influences group by influencer_id order by count(*) desc limit 1;
  if top is null then return; end if;
  perform set_config('request.jwt.claim.sub', top::text, true);
  r := public.my_reach();
  if (r->>'people')::int < 1 or (r->>'added')::int < 1 then
    raise exception 'my_reach returned % for the top influencer', r;
  end if;
end $$;
