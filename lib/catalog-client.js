// Ask the server to fill in full details for an episode or show we just saved. Fire and forget:
// the save itself never waits on this, and a failure just means the daily job does it later.
export function refreshCatalog({ episodeId, feedId } = {}) {
  if (typeof window === "undefined" || (!episodeId && !feedId)) return;
  try {
    fetch("/api/catalog/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(episodeId ? { episodeId } : { feedId }),
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

// Our ids for episodes and shows we only know by Podcast Index numbers. The server finds or creates
// each entry (from Podcast Index) and returns { episodes: { number: id }, shows: { number: id } }.
// Saves use this so every row carries our id. Empty maps if the server can't help (the save then fails,
// since stage D: the database no longer builds entries from copied details).
// Answers are remembered for this visit (our ids never change), so the player, history, resume and saves ask the
// server at most once per episode; a question already on its way is shared rather than sent again.
const known = { episodes: new Map(), shows: new Map() }; // number -> Promise<our id or null>

export async function ensureRefs({ episodeIds = [], feedIds = [] } = {}) {
  const none = { episodes: {}, shows: {} };
  const ep = [...new Set(episodeIds.filter((x) => x != null && x !== "").map(String))];
  const fd = [...new Set(feedIds.filter((x) => x != null && x !== "").map(String))];
  if (typeof window === "undefined" || (!ep.length && !fd.length)) return none;
  const newEp = ep.filter((x) => !known.episodes.has(x));
  const newFd = fd.filter((x) => !known.shows.has(x));
  if (newEp.length || newFd.length) {
    const asked = ask(newEp, newFd);
    for (const x of newEp) known.episodes.set(x, asked.then((m) => m.episodes[x] || null));
    for (const x of newFd) known.shows.set(x, asked.then((m) => m.shows[x] || null));
  }
  const pick = async (ids, map) => Object.fromEntries((await Promise.all(ids.map(async (x) => [x, await map.get(x)]))).filter(([, ref]) => ref));
  const [episodes, shows] = await Promise.all([pick(ep, known.episodes), pick(fd, known.shows)]);
  // Not found (or the server was busy): forget it, so the next save asks again.
  for (const x of ep) if (!episodes[x]) known.episodes.delete(x);
  for (const x of fd) if (!shows[x]) known.shows.delete(x);
  return { episodes, shows };
}

async function ask(episodeIds, feedIds) {
  try {
    const res = await fetch("/api/catalog/ensure", {
      signal: AbortSignal.timeout(10_000), // a save waiting on this mustn't hang
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds, feedIds }),
    });
    if (!res.ok) return { episodes: {}, shows: {} };
    const data = await res.json();
    return { episodes: data.episodes || {}, shows: data.shows || {} };
  } catch {
    return { episodes: {}, shows: {} };
  }
}
