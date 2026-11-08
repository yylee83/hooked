// A log points at our episode (logs.episode_ref → episodes → shows). Pages read the episode's title,
// cover, audio and show from there, not from the copies saved on each log, which go away in stage D.
// `withEpisode` lays those details out under the old column names, so pages don't need to change.

/** Add to a logs select: the log's episode and its show. */
export const LOG_EPISODE =
  "episode:episodes!logs_episode_ref_fkey(id, podcastindex_id, title, image_url, audio_url, duration_seconds, show:shows(id, podcastindex_id, title, image_url))";

/** A log row with `episode_ref`, `episode_id`, `title`, `feed_id`, `feed_title`, `image`, `feed_image`,
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
