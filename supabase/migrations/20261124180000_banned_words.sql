-- Keep Hooked clean: reviews, replies, send notes and list titles can't be saved with a word from banned_words.
--
-- The list is the banned_words table. To add or remove a word: Supabase → Table Editor → banned_words → Insert row
-- (lower case, letters only). End it with * to also block longer words that start with it ("fuck*" blocks
-- "fucking"); without *, only the word itself and its plural ("tits", "asses") are blocked.
--
-- How a word is found:
--   * Whole words only, so "Scunthorpe", "class", "assume" and "Dick Cheney" (dick isn't listed) are fine.
--   * Caps and stretched letters count ("SHIIIT", "fuuuck"), and so do common swaps: @ 4 → a, $ 5 → s, 0 → o, 3 → e,
--     and 1 ! | → i before a letter ("sh1t", "b!tch"). Starred-out words ("f***") are allowed.
--   * A word that's in the episode's or show's own title is allowed, so you can quote it ("Bitch Sesh").
-- Only changed text is checked: older reviews stay as they are, and editing a review's stars keeps working.
-- The app turns the error (code HKW01, the word in details) into "Please edit out …" (lib/clean-words.js).

create table public.banned_words (
  word text primary key check (word ~ '^[a-z]+\*?$'),
  added_at timestamptz not null default now()
);
alter table public.banned_words enable row level security;
-- No policies: the app never reads the list itself, only through banned_word_in() below.
revoke all on public.banned_words from anon, authenticated;

insert into public.banned_words (word) values
  -- swearing
  ('fuck*'), ('motherfuck*'), ('fck'), ('fuk'), ('stfu'),
  ('shit*'), ('bullshit*'), ('horseshit*'), ('dipshit*'), ('batshit'), ('apeshit'), ('shithead*'),
  ('cunt*'), ('bitch*'), ('bastard*'), ('twat*'), ('wank*'), ('douche*'),
  ('ass'), ('asshole*'), ('arse'), ('arsehole*'), ('dumbass*'), ('jackass*'), ('smartass*'), ('dickhead*'),
  -- sexual
  ('cock'), ('cocksuck*'), ('pussy'), ('pussies'), ('tits'), ('titties'), ('clit'), ('dildo*'), ('jizz*'),
  ('blowjob*'), ('handjob*'), ('slut*'), ('whore*'), ('skank*'),
  -- slurs
  ('nigger*'), ('nigga*'), ('niggaz'), ('faggot*'), ('fag'), ('retard'), ('retarded'), ('tranny'), ('trannies'),
  ('kike'), ('spic'), ('gook'), ('wetback*'), ('beaner*'), ('raghead*'), ('towelhead*'), ('paki');

-- Text as it's compared: lower case, symbol swaps undone.
create function public.words_normal(t text) returns text
language sql immutable
as $$ select regexp_replace(translate(lower(coalesce(t, '')), '@4$503', 'aassoe'), '[!|1](?=[a-z])', 'i', 'g') $$;

-- The pattern for one listed word, whole words only. Each letter may be stretched by two or more ("shiiit"), not by
-- one, so "shiitake" is fine.
create function public.word_pattern(w text) returns text
language plpgsql immutable
as $$
declare
  core text := '';
  run text;
begin
  for run in select m[1] from regexp_matches(rtrim(w, '*'), '(([a-z])\2*)', 'g') as m loop
    core := core || '(?:' || run || '|' || run || left(run, 1) || '{2,})';
  end loop;
  return '(?:^|[^a-z])(' || core || case when w like '%*' then '[a-z]*' else '(?:e?s)?' end || ')(?:[^a-z]|$)';
end;
$$;

-- The first banned word in txt (as written there, after undoing swaps), or null. Words that are also in `context`
-- (the episode's and show's titles) don't count.
create function public.banned_word_in(txt text, context text default '') returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  t text := public.words_normal(txt);
  c text := public.words_normal(context);
  p text;
  found text[];
begin
  if t !~ '[a-z]' then return null; end if;
  for p in select public.word_pattern(word) from public.banned_words order by word loop
    found := regexp_match(t, p);
    if found is not null and c !~ p then return found[1]; end if;
  end loop;
  return null;
end;
$$;
revoke all on function public.banned_word_in(text, text) from public, anon, authenticated;
-- The app asks before keeping a review on a signed-out browser (it's saved to the account later).
grant execute on function public.banned_word_in(text, text) to anon, authenticated;
revoke all on function public.words_normal(text) from public, anon, authenticated;
revoke all on function public.word_pattern(text) from public, anon, authenticated;

-- An episode's own words: its title and its show's.
create function public.episode_words(ref text) returns text
language sql stable security definer set search_path = public
as $$ select coalesce(e.title, '') || ' / ' || coalesce(s.title, '') from public.episodes e left join public.shows s on s.id = e.show_id where e.id = ref $$;
revoke all on function public.episode_words(text) from public, anon, authenticated;

create function public.check_words() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  ins boolean := tg_op = 'INSERT';
  bad text;
begin
  if tg_table_name = 'logs' then
    if ins or new.hook is distinct from old.hook then
      bad := public.banned_word_in(new.hook, public.episode_words(new.episode_ref));
    end if;
  elsif tg_table_name = 'comments' then
    if ins or new.body is distinct from old.body then
      bad := public.banned_word_in(new.body, public.episode_words(new.episode_ref));
    end if;
  elsif tg_table_name = 'recommendations' then
    if ins or new.note is distinct from old.note or new.hook is distinct from old.hook then
      bad := coalesce(public.banned_word_in(new.note, public.episode_words(new.episode_ref)),
                      public.banned_word_in(new.hook, public.episode_words(new.episode_ref)));
    end if;
  elsif tg_table_name = 'briefs' then
    -- A list may quote the titles of the episodes in it.
    if ins or new.title is distinct from old.title or new.dek is distinct from old.dek or new.topic is distinct from old.topic then
      bad := public.banned_word_in(concat_ws(' / ', new.title, new.dek, new.topic), new.items::text);
    end if;
  end if;
  if bad is not null then
    raise exception 'Please edit out “%”. Hooked keeps it clean.', bad using errcode = 'HKW01', detail = bad;
  end if;
  return new;
end;
$$;
revoke all on function public.check_words() from public, anon, authenticated;

-- Named to run after fill_refs (triggers run in name order), so the episode id is filled in first.
create trigger words_check before insert or update on public.logs for each row execute function public.check_words();
create trigger words_check before insert or update on public.comments for each row execute function public.check_words();
create trigger words_check before insert or update on public.recommendations for each row execute function public.check_words();
create trigger words_check before insert or update on public.briefs for each row execute function public.check_words();
