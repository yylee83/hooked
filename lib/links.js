// Turn an Apple Podcasts or Spotify link into an episode (or show) in Hooked.
import "server-only";
import { call, findShow, getEpisodes, getShowByItunesId } from "./podcastindex";
import { appleEpisodes } from "./itunes";
import { norm } from "./rank";
import { safeFetch } from "./safe-fetch";

// True for the domain itself or any of its subdomains: "open.spotify.com" is on "spotify.com",
// but "notspotify.com" is not.
const onDomain = (host, ...domains) => domains.some((d) => host === d || host.endsWith(`.${d}`));

const LOOKUP = process.env.ITUNES_LOOKUP_URL || "https://itunes.apple.com/lookup";
const SPOTIFY = process.env.SPOTIFY_BASE_URL || "https://open.spotify.com";

export function isPodcastLink(text = "") {
  return /^(https?:\/\/)?([a-z0-9-]+\.)*(podcasts\.apple\.com|itunes\.apple\.com|open\.spotify\.com|spotify\.link|spoti\.fi)\//i.test(String(text).trim());
}

// Podcast Index call wrapper that never throws.
async function pi(path, params) {
  return call(path, params).catch(() => null);
}

const sameTitle = (a, b) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) > 12 && (x.includes(y) || y.includes(x))));
};

// ---------- Apple ----------
async function fromApple(url) {
  const showId = url.pathname.match(/id(\d+)/)?.[1];
  const epId = url.searchParams.get("i");
  if (!showId) return { error: "That Apple link doesn't point to a podcast." };
  const feed = await getShowByItunesId(showId).catch(() => null);
  if (!feed) return { error: "We couldn't find that show yet." };
  if (!epId) return { feedId: feed.id, kind: "show" };

  // Apple's lookup gives the episode's guid, which Podcast Index can match exactly.
  let ep = null;
  try {
    const res = await fetch(`${LOOKUP}?id=${showId}&entity=podcastEpisode&limit=200&country=US`, { signal: AbortSignal.timeout(6000), next: { revalidate: 3600 } });
    const data = res.ok ? await res.json() : null;
    ep = (data?.results || []).find((r) => String(r.trackId) === String(epId)) || null;
  } catch {}
  if (ep?.episodeGuid) {
    const hit = await pi("/episodes/byguid", { guid: ep.episodeGuid, feedid: feed.id });
    if (hit?.episode?.id) return { episodeId: hit.episode.id };
  }
  // Fall back to the title among the show's recent episodes.
  if (ep?.trackName) {
    const items = await getEpisodes(feed.id, 200).catch(() => []);
    const m = items.find((e) => sameTitle(e.title, ep.trackName));
    if (m) return { episodeId: m.id };
  }
  return { feedId: feed.id, kind: "show", note: "We found the show but not that exact episode. Pick it from the list." };
}

// ---------- Spotify ----------
const meta = (html, prop) =>
  html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1] ||
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1] ||
  "";
const unescape = (s = "") => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function spotifyPage(path) {
  try {
    const res = await fetch(`${SPOTIFY}${path}`, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; HookedOn/1.0; +https://hooked-nu.vercel.app)", "Accept-Language": "en-US" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const title = unescape(meta(html, "og:title"));
    const desc = unescape(meta(html, "og:description") || meta(html, "description"));
    // "Listen to this episode from The Daily on Spotify. …"  or  "The Daily · Episode"
    const show = desc.match(/episode from (.+?) on Spotify/i)?.[1] || desc.match(/^(.+?) · Episode/)?.[1] || "";
    return { title, show };
  } catch {
    return null;
  }
}

async function spotifyOembed(link) {
  try {
    const res = await fetch(`${SPOTIFY}/oembed?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(6000), next: { revalidate: 86400 } });
    return res.ok ? (await res.json()).title || "" : "";
  } catch {
    return "";
  }
}

async function fromSpotify(url) {
  // Short links (spotify.link / spoti.fi) redirect to open.spotify.com.
  if (url.hostname !== "open.spotify.com") {
    try {
      const res = await safeFetch(url.href, { readBody: false, maxRedirects: 5 });
      url = new URL(res.url);
    } catch {
      return { error: "We couldn't open that Spotify link." };
    }
    if (url.hostname !== "open.spotify.com") return { error: "That Spotify link doesn't lead to a podcast." };
  }
  const m = url.pathname.match(/\/(episode|show)\/([A-Za-z0-9]+)/);
  if (!m) return { error: "That Spotify link isn't a podcast episode or show." };
  const [, kind, id] = m;
  const page = await spotifyPage(`/${kind}/${id}`);
  const title = page?.title || (await spotifyOembed(`https://open.spotify.com/${kind}/${id}`));
  if (!title) return { error: "Spotify didn't tell us what that is. Try searching for it." };

  if (kind === "show") {
    const feed = await findShow(title).catch(() => null);
    return feed ? { feedId: feed.id, kind: "show" } : { error: `We couldn't find “${title}” yet.`, query: title };
  }

  // 1) Apple's episode search, matched by title (and show, when we know it), then to Podcast Index by guid.
  const hits = await appleEpisodes(page?.show ? `${page.show} ${title}` : title, 25);
  const best = hits.find((h) => sameTitle(h.title, title) && (!page?.show || sameTitle(h.feedTitle, page.show))) || hits.find((h) => sameTitle(h.title, title));
  if (best?.guid) {
    const feed = await getShowByItunesId(best.itunesShowId).catch(() => null);
    if (feed) {
      const hit = await pi("/episodes/byguid", { guid: best.guid, feedid: feed.id });
      if (hit?.episode?.id) return { episodeId: hit.episode.id };
      const items = await getEpisodes(feed.id, 200).catch(() => []);
      const t = items.find((e) => sameTitle(e.title, title));
      if (t) return { episodeId: t.id };
    }
  }
  // 2) The show by name, then the episode by title.
  if (page?.show) {
    const feed = await findShow(page.show).catch(() => null);
    if (feed) {
      const items = await getEpisodes(feed.id, 200).catch(() => []);
      const t = items.find((e) => sameTitle(e.title, title));
      if (t) return { episodeId: t.id };
      return { feedId: feed.id, kind: "show", note: "We found the show but not that exact episode. Pick it from the list." };
    }
  }
  return { error: `We couldn't match “${title}” yet. Try searching for it.`, query: title };
}

export async function resolveLink(text) {
  let raw = String(text || "").trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "That doesn't look like a link." };
  }
  const host = url.hostname.toLowerCase();
  if (onDomain(host, "podcasts.apple.com", "itunes.apple.com")) return fromApple(url);
  if (onDomain(host, "open.spotify.com", "spotify.link", "spoti.fi")) return fromSpotify(url);
  return { error: "Paste a link from Apple Podcasts or Spotify." };
}
