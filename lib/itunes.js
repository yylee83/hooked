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
      episodeCount: r.trackCount,
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

const LOOKUP = process.env.ITUNES_LOOKUP_URL || "https://itunes.apple.com/lookup";

// Kept an hour. `fresh` skips the saved copy (and doesn't save over it).
async function lookup(params, { fresh = false } = {}) {
  const url = new URL(LOOKUP);
  for (const [k, v] of Object.entries({ country: "US", ...params })) url.searchParams.set(k, String(v));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), ...(fresh ? { cache: "no-store" } : { next: { revalidate: 3600 } }) });
    if (!res.ok) return [];
    return (await res.json()).results || [];
  } catch {
    return [];
  }
}

/** One show by its Apple id, with the address of its own feed. Null if Apple doesn't know it. */
export async function appleShow(itunesId) {
  if (!/^\d{1,15}$/.test(String(itunesId))) return null;
  const r = (await lookup({ id: itunesId, entity: "podcast" })).find((x) => String(x.collectionId) === String(itunesId));
  if (!r) return null;
  return {
    itunesId: String(r.collectionId),
    title: r.collectionName || "",
    author: r.artistName || "",
    image: r.artworkUrl600 || r.artworkUrl100 || "",
    feedUrl: /^https?:\/\//i.test(r.feedUrl || "") ? r.feedUrl : "",
  };
}

/** One episode of a show by Apple ids: its id inside the feed (guid) and title. `country` is the storefront in
 *  the link ("be" in podcasts.apple.com/be/…). */
export async function appleEpisode(showId, episodeId, country = "US") {
  if (!/^\d{1,15}$/.test(String(showId)) || !/^\d{1,20}$/.test(String(episodeId))) return null;
  if (!/^[a-z]{2}$/i.test(country)) country = "US";
  const params = { id: showId, entity: "podcastEpisode", limit: 200 };
  const find = (rows) => rows.find((x) => String(x.trackId) === String(episodeId));
  // Apple lists only a show's newest 200 episodes, so an older one (episode 89 of a show with 400) isn't in it: then
  // ask for the episode itself. The saved list can also be older than the episode: a brand-new episode isn't in it,
  // and once the list is an hour old Next.js still hands back the old copy once while it refreshes. Then ask fresh.
  const r =
    find(await lookup(params)) ||
    find(await lookup({ id: episodeId, entity: "podcastEpisode", country })) ||
    find(await lookup(params, { fresh: true }));
  return r ? { guid: r.episodeGuid || "", title: r.trackName || "", audio: r.episodeUrl || "" } : null;
}

const PAGES = process.env.APPLE_PODCASTS_URL || "https://podcasts.apple.com";

/** An episode's title from its Apple Podcasts web page, when the lookup doesn't list it. */
export async function applePageTitle(showId, episodeId, country = "us") {
  if (!/^\d{1,15}$/.test(String(showId)) || !/^\d{1,20}$/.test(String(episodeId))) return "";
  if (!/^[a-z]{2}$/i.test(country)) country = "us";
  try {
    const res = await fetch(`${PAGES}/${country.toLowerCase()}/podcast/id${showId}?i=${episodeId}`, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HookedOn/1.0; +https://hookedonpods.com)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return "";
    const html = (await res.text()).slice(0, 400000);
    const raw =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i)?.[1] ||
      "";
    return raw
      .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/^\u200e/, "")
      .replace(/\s+(-|on)\s+Apple Podcasts$/i, "")
      .trim();
  } catch {
    return "";
  }
}
