-- Export the live data as one JSON bundle, for a backup or to refill the test database.
-- Run it in Supabase's SQL editor (or through the Supabase MCP) and save the result to a file OUTSIDE
-- this repo, for example ~/claude/hooked-backups/live-YYYY-MM-DD.json. It contains email addresses.
select json_build_object(
  'taken_at', now(),
  'users', (select json_agg(json_build_object('id', id, 'email', email, 'created_at', created_at, 'email_confirmed_at', email_confirmed_at)) from auth.users),
  'profiles', (select json_agg(t) from public.profiles t),
  'logs', (select json_agg(t) from public.logs t),
  'hooked_shows', (select json_agg(t) from public.hooked_shows t),
  'list_items', (select json_agg(t) from public.list_items t),
  'briefs', (select json_agg(t) from public.briefs t),
  'follows', (select json_agg(t) from public.follows t),
  'recommendations', (select json_agg(t) from public.recommendations t),
  'comments', (select json_agg(t) from public.comments t),
  'reactions', (select json_agg(t) from public.reactions t),
  'notifications', (select json_agg(t) from public.notifications t),
  'allowed_emails', (select json_agg(t) from public.allowed_emails t),
  'trending_topics', (select json_agg(t) from public.trending_topics t),
  'shows', (select json_agg(t) from (select id, title, author, description, image_url, website_url, language, categories, feed_url, podcast_guid, podcastindex_id, apple_id, spotify_id, source, last_fetched_at, fetch_error, failures, created_at, updated_at from public.shows) t),
  'episodes', (select json_agg(t) from (select id, show_id, guid, title, published_at, duration_seconds, image_url, season, episode_number, description_html, description_text, audio_url, episode_url, transcripts, podcastindex_id, apple_id, spotify_id, source, last_fetched_at, created_at, updated_at from public.episodes) t)
)::text as bundle;
