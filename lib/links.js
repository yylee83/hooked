// Turn an Apple Podcasts or Spotify link into an episode (or show) in Hooked.
import "server-only";
import { call, findShow, getEpisodes, getShowByItunesId } from "./podcastindex";
import { appleEpisode, appleEpisodes, appleShow, appleShows } from "./itunes";
import { episodeRefFor, findShowEpisode, importFeedShow, showRefFor, spotifyEpisode, spotifyShow } from "./catalog";
import { logHref, showHref } from "./addresses";
import { norm } from "./rank";
import { safeFetch } from "./safe-fetch";

// True for the domain itself or any of its subdomains: "open.spotify.com" is on "spotify.com",
// but "notspotify.com" is not.
const onDomain = (host, ...domains) => domains.some((d) => host === d || host.endsWith(`.${d}`));

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

// Results: { episodeId } / { feedId } are Podcast Index numbers (the page then finds our entry);
// { episodeRef } / { showRef } are our own ids, for shows read from their own feed or Spotify.
const NOT_EXACT = "We found the show but not that exact episode. Pick it from the list.";

// A Podcast Index show, if its page will actually open (Podcast Index sometimes lists shows it can't serve).
async function workingShow(feed) {
  return feed?.id && (await showRefFor(feed.id).catch(() => null)) ? feed : null;
}

// The show's own feed, found through Apple: save it, then find the episode in it.
async function viaFeed(appleShowId, episode = null) {
  const show = await appleShow(appleShowId);
  if (!show?.feedUrl) return null;
  const showRef = await importFeedShow({ feedUrl: show.feedUrl, appleId: show.itunesId }).catch(() => null);
  if (!showRef) return null;
  if (!episode) return { showRef, kind: "show" };
  const episodeRef = await findShowEpisode(showRef, episode).catch(() => null);
  return episodeRef ? { episodeRef } : { showRef, kind: "show", note: NOT_EXACT };
}

// ---------- Apple ----------
async function fromApple(url) {
  const showId = url.pathname.match(/id(\d+)/)?.[1];
  const epId = url.searchParams.get("i");
  if (!showId) return { error: "That Apple link doesn't point to a podcast." };
  const feed = await getShowByItunesId(showId).catch(() => null);
  const ep = epId ? await appleEpisode(showId, epId) : null;

  if (feed && epId) {
    // Apple's lookup gives the episode's guid, which Podcast Index can match exactly.
    if (ep?.guid) {
      const hit = await pi("/episodes/byguid", { guid: ep.guid, feedid: feed.id });
      if (hit?.episode?.id) return { episodeId: hit.episode.id };
    }
    // Fall back to the title among the show's recent episodes.
    if (ep?.title) {
      const items = await getEpisodes(feed.id, 200).catch(() => []);
      const m = items.find((e) => sameTitle(e.title, ep.title));
      if (m) return { episodeId: m.id };
    }
  }
  if (feed && !epId && (await workingShow(feed))) return { feedId: feed.id, kind: "show" };

  // Podcast Index doesn't have it, or not this episode: read the show's own feed.
  const own = await viaFeed(showId, epId ? { guid: ep?.guid, title: ep?.title } : null);
  if (own) return own;
  if (await workingShow(feed)) return { feedId: feed.id, kind: "show", ...(epId ? { note: NOT_EXACT } : {}) };
  return { error: "We couldn't find that show yet." };
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
    const showId = path.startsWith("/episode/") ? html.match(/open\.spotify\.com\/show\/([A-Za-z0-9]{22})/)?.[1] || "" : "";
    const image = /^https:\/\/i\.scdn\.co\//.test(meta(html, "og:image")) ? meta(html, "og:image") : "";
    return { title, show, showId, image };
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
    const feed = await workingShow(await findShow(title).catch(() => null));
    if (feed) return { feedId: feed.id, kind: "show" };
    // Not in Podcast Index: Apple may list its feed; otherwise keep a basic Spotify-only entry.
    const apple = (await appleShows(title, 10)).find((a) => sameTitle(a.title, title));
    const own = apple ? await viaFeed(apple.itunesId) : null;
    if (own) return own;
    const showRef = await spotifyShow({ showId: id, title, image: page?.image }).catch(() => null);
    return showRef ? { showRef, kind: "show" } : { error: `We couldn't find “${title}” yet.`, query: title };
  }

  // 1) Apple's episode search, matched by title (and show, when we know it), then to Podcast Index by guid.
  const hits = await appleEpisodes(page?.show ? `${page.show} ${title}` : title, 25);
  const best = hits.find((h) => sameTitle(h.title, title) && (!page?.show || sameTitle(h.feedTitle, page.show))) || hits.find((h) => sameTitle(h.title, title));
  let foundShow = null; // a show we found without the exact episode: better than a duplicate Spotify-only entry
  if (best?.guid) {
    const feed = await getShowByItunesId(best.itunesShowId).catch(() => null);
    if (feed) {
      const hit = await pi("/episodes/byguid", { guid: best.guid, feedid: feed.id });
      if (hit?.episode?.id) return { episodeId: hit.episode.id };
      const items = await getEpisodes(feed.id, 200).catch(() => []);
      const t = items.find((e) => sameTitle(e.title, title));
      if (t) return { episodeId: t.id };
    }
    // 2) Podcast Index lacks it (or this episode): the show's own feed, through Apple.
    const own = await viaFeed(best.itunesShowId, { guid: best.guid, title });
    if (own?.episodeRef) return own;
    foundShow ||= own;
  }
  // 3) The show by name in Podcast Index, then the episode by title.
  if (page?.show) {
    const feed = await findShow(page.show).catch(() => null);
    if (feed) {
      const items = await getEpisodes(feed.id, 200).catch(() => []);
      const t = items.find((e) => sameTitle(e.title, title));
      if (t) return { episodeId: t.id };
    }
    // 4) The show by name at Apple, then its own feed.
    if (!foundShow) {
      const apple = (await appleShows(page.show, 10)).find((a) => sameTitle(a.title, page.show));
      const own = apple ? await viaFeed(apple.itunesId, { title }) : null;
      if (own?.episodeRef) return own;
      foundShow ||= own;
    }
    if (!foundShow && (await workingShow(feed))) foundShow = { feedId: feed.id, kind: "show", note: NOT_EXACT };
  }
  if (foundShow) return foundShow;
  // 5) Nowhere with a public feed: a basic Spotify-only entry, so it can still be logged.
  const episodeRef = await spotifyEpisode({ episodeId: id, showId: page?.showId, title, showTitle: page?.show, image: page?.image }).catch(() => null);
  if (episodeRef) return { episodeRef };
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

/** Where a resolved link should take you: the log sheet for an episode, or the show page (with any
 *  note about the episode we couldn't match). Our short address when possible; null if nothing matched. */
export async function linkTarget(r) {
  const note = r.note ? `?note=${encodeURIComponent(r.note)}` : "";
  if (r.episodeRef) return logHref(r.episodeRef);
  if (r.episodeId) return logHref(await episodeRefFor(r.episodeId), r.episodeId);
  if (r.showRef) return `${showHref(r.showRef)}${note}`;
  if (r.feedId) return `${showHref(await showRefFor(r.feedId), r.feedId)}${note}`;
  return null;
}
