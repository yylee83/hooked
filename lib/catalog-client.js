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
// Saves use this so every row carries our id. Empty maps if the server can't help (the database then
// fills the id in itself, until stage D).
export async function ensureRefs({ episodeIds = [], feedIds = [] } = {}) {
  const none = { episodes: {}, shows: {} };
  const ep = episodeIds.filter((x) => x != null && x !== "");
  const fd = feedIds.filter((x) => x != null && x !== "");
  if (typeof window === "undefined" || (!ep.length && !fd.length)) return none;
  try {
    const res = await fetch("/api/catalog/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: ep, feedIds: fd }),
    });
    if (!res.ok) return none;
    const data = await res.json();
    return { episodes: data.episodes || {}, shows: data.shows || {} };
  } catch {
    return none;
  }
}
