// Talks to Podcast Index from the server only. Your secret never reaches the browser.
import "server-only";
import crypto from "crypto";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { byName, episodeFields, exactTitle, norm as normText, rankResults, showFields, showName } from "./rank";
import { appleEpisodes, appleShows } from "./itunes";

const BASE = process.env.PODCASTINDEX_BASE_URL || "https://api.podcastindex.org/api/1.0";

export class MissingKeysError extends Error {}

// How long to reuse an answer, by question. Each request carries a fresh signature, which Next's fetch cache
// counts as a new request, so we cache by the question instead (unstable_cache). Failed requests aren't kept.
const LIFETIME = {
  "/search/byterm": 3600,
  "/search/bytitle": 3600,
  "/search/byperson": 3600,
  "/podcasts/byitunesid": 86400, // which Podcast Index show an Apple show is: rarely changes
  "/episodes/byguid": 86400, // which episode has this id: doesn't change
};
const DEFAULT_LIFETIME = 900; // show and episode details, newest episodes, trending (the daily refresh reads these)
const TIMEOUT = 8000; // a stuck Podcast Index mustn't hang the page

export async function call(path, params = {}) {
  const key = process.env.PODCASTINDEX_API_KEY;
  const secret = process.env.PODCASTINDEX_API_SECRET;
  if (!key || !secret) throw new MissingKeysError("Podcast Index keys are missing.");
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]).sort());
  return unstable_cache(() => ask(path, clean, key, secret), ["podcastindex", BASE, path, JSON.stringify(clean)], {
    revalidate: LIFETIME[path] ?? DEFAULT_LIFETIME,
  })();
}

async function ask(path, params, key, secret) {
  // The "stamp": a fingerprint of key + secret + the current time.
  const time = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash("sha1").update(key + secret + time).digest("hex");

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v); // "" = a flag like fulltext

  const res = await fetch(url, {
    headers: {
      "User-Agent": "HookedOn/0.1 (hookedonpods.com)",
      "X-Auth-Key": key,
      "X-Auth-Date": String(time),
      Authorization: hash,
    },
    cache: "no-store", // cached above, by the question
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error(`Podcast Index returned ${res.status}`);
  return res.json();
}

export const trendingShows = cache(async (max = 12) => {
  const data = await call("/podcasts/trending", { max, lang: "en" });
  return data.feeds || [];
});

const YEAR = 365 * 86400;
const nowSec = () => Math.floor(Date.now() / 1000);

// Apple's top answers are usually the show people mean: #1 ≈ +450, #3 ≈ +300, #10 ≈ +75, #25 ≈ +3.
const appleBoost = (rank) => (rank ? Math.round(450 * 0.82 ** (rank - 1)) : 0);
// Most people here listen in English: other languages rank lower (but still show up).
const otherLanguage = (lang) => !!lang && !/^en\b|^en[-_]|^english/i.test(String(lang).trim());

// Shows matching a search, best first. Combines Apple's search (which knows what's popular)
// with Podcast Index's, then ranks: exact name, then relevance, popularity and whether it's still active.
// Shows Apple knows but Podcast Index doesn't come back as { appleOnly: true, itunesId, … }: lib/search.js
// links them to our own entry, or to one made when tapped.
export const searchShows = cache(async (q, max = 40) => {
  const pool = Math.max(60, max);
  const [byTerm, byTitle, apple] = await Promise.all([
    call("/search/byterm", { q, max: pool, fulltext: "" }),
    call("/search/bytitle", { q, max: 30, fulltext: "", similar: "" }).catch(() => ({ feeds: [] })),
    appleShows(q, 25),
  ]);
  // Match Apple's results to Podcast Index so they open in Hooked.
  const mapped = await Promise.all(
    apple.slice(0, 15).map(async (a) => {
      const feed = await getShowByItunesId(a.itunesId).catch(() => null);
      if (feed?.id) return { ...feed, appleRank: a.appleRank };
      // Podcast Index doesn't have it: keep Apple's answer anyway.
      return { appleOnly: true, itunesId: a.itunesId, title: a.title, author: a.author, artwork: a.image, appleRank: a.appleRank };
    })
  );
  const rankOf = new Map(apple.map((a) => [a.itunesId, a.appleRank]));
  const seen = new Set();
  const key = (f) => (f.appleOnly ? `apple:${f.itunesId}` : f.id);
  const feeds = [...mapped, ...(byTitle.feeds || []), ...(byTerm.feeds || [])]
    .filter((f) => f && (f.id || f.appleOnly) && !seen.has(key(f)) && seen.add(key(f)))
    .map((f) => ({ ...f, appleRank: f.appleRank || rankOf.get(String(f.itunesId)) || 0 }));
  const boost = (f) => {
    let b = 0;
    if (exactTitle(q, f.title)) b += 300;
    b += appleBoost(f.appleRank);
    b += Math.min(30, Math.log10((f.episodeCount || 0) + 1) * 10);
    const newest = f.newestItemPubdate || f.lastUpdateTime || 0;
    if (newest && nowSec() - newest > YEAR) b -= 60; // hasn't posted in a year
    if (otherLanguage(f.language)) b -= 200;
    return b;
  };
  let ranked = rankResults(q, feeds, showFields, (f) => f.episodeCount || 0, boost);
  // Matching only in the description ("Michelle Collins was our guest…") counts only when nothing
  // matches by name or host.
  if (ranked.some((f) => byName(q, f))) ranked = ranked.filter((f) => byName(q, f));
  // The same show listed twice (Podcast Index often has duplicate feeds): keep the better-ranked one.
  const names = new Set();
  ranked = ranked.filter((f) => {
    const k = `${normText(showName(f.title))}|${normText(f.author || f.ownerName || "")}`;
    return !names.has(k) && names.add(k);
  });
  return ranked.slice(0, max);
});

// Episodes about a person or topic. Combines Apple's episode search, Podcast Index's
// person/topic search, and the latest episodes of shows named for the query
// (so "kara swisher" includes her own shows). Recent episodes get a nudge.
export const searchEpisodes = cache(async (q, max = 40) => {
  const [pi, apple, shows] = await Promise.all([
    call("/search/byperson", { q, max: Math.max(150, max), fulltext: "" }).catch(() => ({ items: [] })),
    appleEpisodes(q, 50),
    searchShows(q, 6).catch(() => []),
  ]);

  // Apple episodes → Podcast Index episodes (by show, then by the episode's guid).
  const showIds = [...new Set(apple.map((a) => a.itunesShowId))].slice(0, 15);
  const feedByItunes = new Map(
    await Promise.all(showIds.map(async (id) => [id, await getShowByItunesId(id).catch(() => null)]))
  );
  const fromApple = (
    await Promise.all(
      apple.slice(0, 30).map(async (a) => {
        const feed = feedByItunes.get(a.itunesShowId);
        if (!a.guid) return null;
        // Podcast Index doesn't have the show: lib/search.js finds the episode in our own tables, if
        // we've brought the show in from its feed.
        if (!feed) return { appleOnly: true, guid: a.guid, itunesShowId: a.itunesShowId, title: a.title, feedTitle: a.feedTitle, description: a.description, datePublished: a.date, appleRank: a.appleRank };
        const data = await call("/episodes/byguid", { guid: a.guid, feedid: feed.id }).catch(() => null);
        const e = data?.episode;
        return e && e.id ? { ...e, feedTitle: e.feedTitle || feed.title, feedImage: e.feedImage || feed.artwork || feed.image, appleRank: a.appleRank } : null;
      })
    )
  ).filter(Boolean);

  // Shows named for the query (exact name, or the phrase in the title/author): their latest episodes.
  const named = shows.filter((f) => f.id && !f.appleOnly).filter((f) => exactTitle(q, f.title) || normText(`${f.title} ${f.author || ""}`).includes(normText(q))).slice(0, 2);
  const fromShows = (
    await Promise.all(named.map((f) => getEpisodes(f.id, 10).then((items) => items.map((e) => ({ ...e, feedTitle: e.feedTitle || f.title, feedImage: e.feedImage || f.artwork || f.image }))).catch(() => [])))
  ).flat();

  const seen = new Set();
  const key = (e) => (e.appleOnly ? `apple:${e.guid}` : e.id);
  const items = [...fromApple, ...(pi.items || []), ...fromShows].filter((e) => e && (e.id || e.appleOnly) && !seen.has(key(e)) && seen.add(key(e)));
  const boost = (e) => {
    const age = nowSec() - (e.datePublished || 0);
    let b = age < 30 * 86400 ? 40 : age < YEAR ? 15 : 0;
    if (e.appleRank) b += Math.max(0, 31 - e.appleRank) * 2;
    return b;
  };
  // Apple-only episodes don't count toward `max`: lib/search.js drops the ones we don't have, and they mustn't
  // crowd out episodes we can show.
  const out = [];
  let kept = 0;
  for (const e of rankResults(q, items, episodeFields, (e) => e.datePublished || 0, boost)) {
    if (kept >= max) break;
    out.push(e);
    if (!e.appleOnly) kept++;
  }
  return out;
});

export const getShow = cache(async (id) => {
  const data = await call("/podcasts/byfeedid", { id });
  return data.feed && data.feed.id ? data.feed : null;
});

// Find a show by its Apple Podcasts id (used to match the Apple charts).
export const getShowByItunesId = cache(async (id) => {
  const data = await call("/podcasts/byitunesid", { id });
  return data.feed && data.feed.id ? data.feed : null;
});

export const getEpisodes = cache(async (feedId, max = 30) => {
  const data = await call("/episodes/byfeedid", { id: feedId, max });
  return data.items || [];
});

export const getEpisode = cache(async (id) => {
  const data = await call("/episodes/byid", { id });
  return data.episode && data.episode.id ? data.episode : null;
});

const norm = (s = "") =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

// Find a show by its name (used for Briefs and the sample friend feed).
export const findShow = cache(async (title) => {
  const feeds = (await searchShows(title)).filter((f) => f.id && !f.appleOnly);
  const target = norm(title);
  return (
    feeds.find((f) => norm(f.title) === target) ||
    feeds.find((f) => norm(f.title).includes(target)) ||
    feeds[0] ||
    null
  );
});

// Find a specific episode of a show by (part of) its title.
export const findEpisode = cache(async (feedId, title) => {
  const items = await getEpisodes(feedId, 100);
  const target = norm(title);
  return items.find((e) => norm(e.title).includes(target)) || null;
});

// Run a request and turn failures into something a page can show.
export async function safe(promise) {
  try {
    return { data: await promise, error: null };
  } catch (e) {
    return { data: null, error: e instanceof MissingKeysError ? "keys" : "down" };
  }
}

// The slim version of an episode that gets passed to the browser.
export function episodeCard(e, show) {
  return {
    id: e.id,
    title: e.title,
    feedId: e.feedId || show?.id,
    feedTitle: e.feedTitle || show?.title || "",
    image: e.image || e.feedImage || artOf(show),
    feedImage: e.feedImage || artOf(show),
    audio: e.enclosureUrl || "",
    duration: e.duration || 0,
    date: e.datePublished || 0,
    // Our short ids, when the episode or show came from our own tables (see lib/addresses.js).
    ...(e.ref ? { ref: e.ref } : {}),
    ...(e.showRef || show?.ref ? { showRef: e.showRef || show.ref } : {}),
  };
}

export function artOf(item) {
  return item?.artwork || item?.image || item?.feedImage || "";
}

export function plainText(html = "") {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
