// "New episodes from your hooked shows" on Home (components/NewEpisodes.js).
// POST { shows: [our ids or Podcast Index numbers], logged: [episode ids] }:
//   - with hooked shows: up to 2 of the newest episodes from each (up to 12 shows), newest first, skipping episodes
//     you've logged. Asked fresh, so an episode that just came out shows up right away.
//   - without (signed out, or nothing hooked yet): the newest episode of each popular show on Hooked.
// Spotify-only episodes can't play here, so only episodes with audio are returned.
import { getEpisodes, episodeCard, safe } from "@/lib/podcastindex";
import { popularOnHooked } from "@/lib/charts";
import { REF, newestOfShow, showRowsFor, withRefs } from "@/lib/catalog";

const PI_ID = /^\d{1,15}$/;
const ids = (a, max) => [...new Set((Array.isArray(a) ? a : []).map(String).filter((x) => REF.test(x) || PI_ID.test(x)))].slice(0, max);
const MAX = 12;
const PER_SHOW = 2;

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {}
  const shows = ids(body.shows, MAX);
  const logged = new Set(ids(body.logged, 2000));
  const isLogged = (c) => (c.ref && logged.has(c.ref)) || (c.id != null && logged.has(String(c.id)));

  if (shows.length) {
    const rows = await showRowsFor(shows);
    const seenShow = new Set();
    const lists = await Promise.all(
      shows.map(async (id) => {
        const row = rows.get(id);
        // The same show listed by both ids counts once.
        const key = row?.id || id;
        if (seenShow.has(key)) return [];
        seenShow.add(key);
        const piId = row?.podcastindex_id || (PI_ID.test(id) ? id : null);
        const eps = await newestOfShow(row, piId, PER_SHOW + 2, { fresh: true });
        return eps.filter((c) => c.audio && !isLogged(c)).slice(0, PER_SHOW);
      })
    );
    const episodes = lists.flat().sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, MAX);
    return Response.json({ mode: "hooked", episodes });
  }

  // Popular on Hooked: each show's newest episode (Podcast Index answers kept 15 minutes are fine here).
  const popular = await popularOnHooked(30, MAX);
  const rows = await showRowsFor(popular.map((s) => s.showRef).filter(Boolean));
  const episodes = (
    await Promise.all(
      popular.map(async (s) => {
        const row = rows.get(s.showRef);
        if (row) return (await newestOfShow(row, row.podcastindex_id, 3, { known: s })).find((c) => c.audio && !isLogged(c));
        if (!s.feedId) return null;
        const { data } = await safe(getEpisodes(s.feedId, 1));
        return data?.[0] ? episodeCard(data[0], { id: s.feedId, title: s.title, image: s.image }) : null;
      })
    )
  ).filter((c) => c?.audio);
  return Response.json({ mode: "popular", episodes: await withRefs(episodes.sort((a, b) => (b.date || 0) - (a.date || 0))) });
}
