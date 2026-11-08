// Search results Podcast Index doesn't have (lib/podcastindex.js marks them `appleOnly`): Apple knows
// the show, so we use our own entry for it if we've brought it in from its feed already. Otherwise a show
// links to /show/apple/<id>, which brings it in when tapped (like pasting its Apple link), and an episode
// is left out until we have its show.
import "server-only";
import { publicDb } from "@/lib/supabase/public";

const SHOW_FIELDS = "id, apple_id, title, author, image_url";
const EPISODE_FIELDS =
  "id, guid, podcastindex_id, title, image_url, audio_url, duration_seconds, published_at, description_text, show:shows!inner(id, apple_id, podcastindex_id, title, image_url)";

async function ourShowsByApple(appleIds) {
  const ids = [...new Set(appleIds.map(Number).filter(Boolean))];
  const db = publicDb();
  if (!db || !ids.length) return new Map();
  const { data } = await db.from("shows").select(SHOW_FIELDS).in("apple_id", ids);
  return new Map((data || []).map((r) => [String(r.apple_id), r]));
}

/** Shows from searchShows, with Apple-only ones pointed at our entry or at /show/apple/<id>. */
export async function placeAppleShows(shows) {
  const ours = await ourShowsByApple(shows.filter((s) => s.appleOnly).map((s) => s.itunesId));
  return shows.map((s) => {
    if (!s.appleOnly) return s;
    const r = ours.get(String(s.itunesId));
    if (r) return { ...s, appleOnly: false, showRef: r.id, title: r.title || s.title, author: r.author || s.author, artwork: r.image_url || s.artwork };
    return { ...s, href: `/show/apple/${s.itunesId}` };
  });
}

/** Episodes from searchEpisodes (Podcast Index shapes), with Apple-only ones swapped for our own
 *  copy of the episode, or dropped if we don't have it. */
export async function placeAppleEpisodes(items) {
  const apple = items.filter((e) => e.appleOnly);
  if (!apple.length) return items;
  const db = publicDb();
  const guids = [...new Set(apple.map((e) => e.guid).filter(Boolean))];
  const appleIds = [...new Set(apple.map((e) => Number(e.itunesShowId)).filter(Boolean))];
  const { data } =
    db && guids.length && appleIds.length
      ? await db.from("episodes").select(EPISODE_FIELDS).in("guid", guids).in("show.apple_id", appleIds)
      : { data: [] };
  const byKey = new Map((data || []).map((r) => [`${r.show.apple_id}|${r.guid}`, r]));
  return items
    .map((e) => {
      if (!e.appleOnly) return e;
      const r = byKey.get(`${e.itunesShowId}|${e.guid}`);
      if (!r) return null;
      return {
        id: r.podcastindex_id ?? undefined,
        ref: r.id,
        showRef: r.show.id,
        title: r.title,
        feedId: r.show.podcastindex_id ?? undefined,
        feedTitle: r.show.title || "",
        image: r.image_url || r.show.image_url || "",
        feedImage: r.show.image_url || "",
        enclosureUrl: r.audio_url || "",
        duration: r.duration_seconds || 0,
        datePublished: r.published_at ? Math.floor(new Date(r.published_at).getTime() / 1000) : 0,
        description: r.description_text || "",
      };
    })
    .filter(Boolean);
}
