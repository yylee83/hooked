// Logs, sends (recommendations) and Up next (list_items) point at our episode (episode_ref → episodes
// → shows). Pages read the episode's title, cover, audio and show from there, not from the copies saved
// on each row, which go away in stage D. `withEpisode` lays those details out under the old column
// names, so pages don't need to change.

const EPISODE_FIELDS = "id, podcastindex_id, title, image_url, audio_url, duration_seconds, show:shows(id, podcastindex_id, title, image_url)";

/** Add to a select on `table`: the row's episode and its show. */
export const episodeOf = (table) => `episode:episodes!${table}_episode_ref_fkey(${EPISODE_FIELDS})`;

/** Add to a logs select: the log's episode and its show. */
export const LOG_EPISODE = episodeOf("logs");

/** Add to a hooked_shows select: the show itself (its name and cover come from there, not the copies). */
export const HOOKED_SHOW = "show:shows!hooked_shows_show_ref_fkey(id, podcastindex_id, title, image_url)";

/** A hooked_shows row with `show_ref`, `feed_id`, `title` and `image` filled in from its show. */
export function withShow(row) {
  const s = row?.show;
  if (!s) return row;
  return { ...row, show_ref: s.id, feed_id: s.podcastindex_id ?? null, title: s.title || "", image: s.image_url || null };
}

/** A log (or send, or Up next) row with `episode_ref`, `episode_id`, `title`, `feed_id`, `feed_title`, `image`, `feed_image`,
 *  `audio`, `duration` and `show_ref` filled in from its episode and show. */
export function withEpisode(row) {
  const e = row?.episode;
  if (!e) return row;
  const s = e.show || {};
  return {
    ...row,
    episode_ref: row.episode_ref || e.id,
    episode_id: e.podcastindex_id ?? null,
    title: e.title || "",
    feed_id: s.podcastindex_id ?? null,
    feed_title: s.title || "",
    image: e.image_url || s.image_url || null,
    feed_image: s.image_url || null,
    audio: e.audio_url || null,
    duration: e.duration_seconds || null,
    show_ref: s.id || null,
  };
}
