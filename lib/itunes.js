// Apple Podcasts' public search (free, no key). It knows which shows are popular,
// which Podcast Index doesn't, so we use it to rank and to find episodes.
import "server-only";

const BASE = process.env.ITUNES_SEARCH_URL || "https://itunes.apple.com/search";

async function search(params) {
  const url = new URL(BASE);
  for (const [k, v] of Object.entries({ media: "podcast", country: "US", ...params })) url.searchParams.set(k, String(v));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

// Shows, in Apple's order (roughly: best match, then most popular).
export async function appleShows(term, limit = 25) {
  const rows = await search({ term, entity: "podcast", limit });
  return rows
    .filter((r) => r.collectionId)
    .map((r, i) => ({
      itunesId: String(r.collectionId),
      title: r.collectionName || r.trackName || "",
      author: r.artistName || "",
      image: r.artworkUrl600 || r.artworkUrl100 || "",
      appleRank: i + 1,
    }));
}

// Episodes, in Apple's order.
export async function appleEpisodes(term, limit = 50) {
  const rows = await search({ term, entity: "podcastEpisode", limit });
  return rows
    .filter((r) => r.collectionId && (r.episodeGuid || r.episodeUrl))
    .map((r, i) => ({
      itunesShowId: String(r.collectionId),
      guid: r.episodeGuid || "",
      audio: r.episodeUrl || "",
      title: r.trackName || "",
      feedTitle: r.collectionName || "",
      description: r.description || r.shortDescription || "",
      date: r.releaseDate ? Math.floor(new Date(r.releaseDate).getTime() / 1000) : 0,
      appleRank: i + 1,
    }));
}
