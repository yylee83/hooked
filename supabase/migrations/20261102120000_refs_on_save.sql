-- Step 7, stage B1: every save fills in our show and episode references by itself.
-- The app keeps sending Podcast Index numbers and the details it copies (title, cover, audio). On every
-- save, the database finds our matching show and episode, or creates a basic one from those details,
-- and fills in episode_ref / show_ref. Nothing can be saved without a reference, even if Podcast Index
-- is down. A server route (/api/catalog/refresh) later upgrades basic entries with full details.

-- Our show for a Podcast Index show number, created from the copied details if we don't have it yet.
create function public.show_ref_for(p_feed_id bigint, p_title text, p_image text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  ref text;
begin
  if p_feed_id is null then
    return null;
  end if;
  select id into ref from public.shows where podcastindex_id = p_feed_id;
  if ref is null then
    insert into public.shows (podcastindex_id, title, image_url, source)
    values (p_feed_id, coalesce(nullif(left(p_title, 300), ''), 'Untitled show'), nullif(p_image, ''), 'legacy')
    on conflict (podcastindex_id) do nothing
    returning id into ref;
    if ref is null then -- someone else created it at the same moment
      select id into ref from public.shows where podcastindex_id = p_feed_id;
    end if;
  end if;
  return ref;
end;
$$;

-- Our episode for a Podcast Index episode number, created (with its show) if we don't have it yet.
create function public.episode_ref_for(
  p_episode_id bigint, p_feed_id bigint, p_title text, p_feed_title text,
  p_image text, p_feed_image text, p_audio text, p_duration int)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  ref text;
  show text;
begin
  if p_episode_id is null then
    return null;
  end if;
  select id into ref from public.episodes where podcastindex_id = p_episode_id;
  if ref is null then
    show := public.show_ref_for(p_feed_id, p_feed_title, coalesce(p_feed_image, p_image));
    if show is null then
      return null; -- no show number to attach it to; the nightly fill-in can try again
    end if;
    insert into public.episodes (podcastindex_id, show_id, title, image_url, audio_url, duration_seconds, source)
    values (p_episode_id, show, coalesce(nullif(left(p_title, 500), ''), 'Untitled episode'),
            nullif(p_image, ''), nullif(p_audio, ''), p_duration, 'legacy')
    on conflict (podcastindex_id) do nothing
    returning id into ref;
    if ref is null then
      select id into ref from public.episodes where podcastindex_id = p_episode_id;
    end if;
  end if;
  return ref;
end;
$$;

-- ---------- one trigger per table ----------
-- Each runs before a row is saved. It only fills a reference that's empty, or that no longer matches
-- because the Podcast Index number changed.

create function public.fill_refs_logs() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.episode_ref is null or (tg_op = 'UPDATE' and new.episode_id is distinct from old.episode_id) then
    new.episode_ref := public.episode_ref_for(new.episode_id, new.feed_id, new.title, new.feed_title,
                                              new.image, new.feed_image, new.audio, new.duration);
  end if;
  return new;
end;
$$;
create trigger fill_refs before insert or update on public.logs
  for each row execute function public.fill_refs_logs();

create function public.fill_refs_recommendations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.episode_ref is null then
    new.episode_ref := public.episode_ref_for(new.episode_id, new.feed_id, new.title, new.feed_title,
                                              new.image, null, new.audio, new.duration);
  end if;
  return new;
end;
$$;
create trigger fill_refs before insert or update on public.recommendations
  for each row execute function public.fill_refs_recommendations();

create function public.fill_refs_list_items() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.show_ref is null or (tg_op = 'UPDATE' and new.feed_id is distinct from old.feed_id) then
    new.show_ref := public.show_ref_for(new.feed_id, new.feed_title, null);
  end if;
  if new.episode_id is not null and (new.episode_ref is null or (tg_op = 'UPDATE' and new.episode_id is distinct from old.episode_id)) then
    new.episode_ref := public.episode_ref_for(new.episode_id, new.feed_id, new.title, new.feed_title,
                                              new.image, null, null, null);
  end if;
  return new;
end;
$$;
create trigger fill_refs before insert or update on public.list_items
  for each row execute function public.fill_refs_list_items();

create function public.fill_refs_hooked_shows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.show_ref is null or (tg_op = 'UPDATE' and new.feed_id is distinct from old.feed_id) then
    new.show_ref := public.show_ref_for(new.feed_id, new.title, new.image);
  end if;
  return new;
end;
$$;
create trigger fill_refs before insert or update on public.hooked_shows
  for each row execute function public.fill_refs_hooked_shows();

-- Comments, reactions and notifications are always about an episode someone already logged or sent,
-- so they only look it up.
create function public.fill_refs_lookup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.episode_ref is null and new.episode_id is not null then
    select id into new.episode_ref from public.episodes where podcastindex_id = new.episode_id;
  end if;
  return new;
end;
$$;
create trigger fill_refs before insert on public.comments for each row execute function public.fill_refs_lookup();
create trigger fill_refs before insert on public.reactions for each row execute function public.fill_refs_lookup();
create trigger fill_refs before insert on public.notifications for each row execute function public.fill_refs_lookup();

-- Brief items: each item gains episodeRef and showRef (kept if already right).
create function public.fill_refs_briefs() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  it jsonb;
  ep text;
  sh text;
  result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then
    return new;
  end if;
  for it in select x from jsonb_array_elements(new.items) as x loop
    ep := null;
    if it ->> 'episodeId' ~ '^\d+$' and it ->> 'feedId' ~ '^\d+$' then
      ep := public.episode_ref_for(
        (it ->> 'episodeId')::bigint, (it ->> 'feedId')::bigint, it ->> 'episode', it ->> 'show',
        it ->> 'image', null, it ->> 'audio',
        case when it ->> 'duration' ~ '^\d+$' then (it ->> 'duration')::int end);
    end if;
    if ep is not null then
      select show_id into sh from public.episodes where id = ep;
      it := it || jsonb_build_object('episodeRef', ep, 'showRef', sh);
    end if;
    result := result || jsonb_build_array(it); -- items without numbers are kept exactly as they were
  end loop;
  new.items := result;
  return new;
end;
$$;
create trigger fill_refs before insert or update on public.briefs
  for each row execute function public.fill_refs_briefs();

-- None of these can be called through the API; they only run as part of a save.
revoke execute on function public.show_ref_for(bigint, text, text) from public, anon, authenticated;
revoke execute on function public.episode_ref_for(bigint, bigint, text, text, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.fill_refs_logs() from public, anon, authenticated;
revoke execute on function public.fill_refs_recommendations() from public, anon, authenticated;
revoke execute on function public.fill_refs_list_items() from public, anon, authenticated;
revoke execute on function public.fill_refs_hooked_shows() from public, anon, authenticated;
revoke execute on function public.fill_refs_lookup() from public, anon, authenticated;
revoke execute on function public.fill_refs_briefs() from public, anon, authenticated;

-- Catch anything saved between stage A and now.
select public.backfill_refs();
