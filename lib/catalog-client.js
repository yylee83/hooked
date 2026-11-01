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
