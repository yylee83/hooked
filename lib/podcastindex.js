// Talks to Podcast Index from the server only. Your secret never reaches the browser.
import "server-only";
import crypto from "crypto";
import { cache } from "react";
import { episodeFields, rankResults, showFields } from "./rank";

const BASE = process.env.PODCASTINDEX_BASE_URL || "https://api.podcastindex.org/api/1.0";

export class MissingKeysError extends Error {}

async function call(path, params = {}) {
  const key = process.env.PODCASTINDEX_API_KEY;
  const secret = process.env.PODCASTINDEX_API_SECRET;
  if (!key || !secret) throw new MissingKeysError("Podcast Index keys are missing.");

  // The "stamp": a fingerprint of key + secret + the current time.
  const time = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash("sha1").update(key + secret + time).digest("hex");

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v)); // "" = a flag like fulltext
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": "HookedOn/0.1 (hookedonpods.com)",
      "X-Auth-Key": key,
      "X-Auth-Date": String(time),
      Authorization: hash,
    },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`Podcast Index returned ${res.status}`);
  return res.json();
}

export const trendingShows = cache(async (max = 12) => {
  const data = await call("/podcasts/trending", { max, lang: "en" });
  return data.feeds || [];
});

// Shows whose title, author or owner matches.
// Shows matching a search, best matches first. Combines a title search with a broader one.
export const searchShows = cache(async (q, max = 40) => {
  const pool = Math.max(60, max);
  const [byTerm, byTitle] = await Promise.all([
    call("/search/byterm", { q, max: pool, fulltext: "" }),
    call("/search/bytitle", { q, max: 30, fulltext: "", similar: "" }).catch(() => ({ feeds: [] })),
  ]);
  const seen = new Set();
  const feeds = [...(byTitle.feeds || []), ...(byTerm.feeds || [])].filter((f) => f && f.id && !seen.has(f.id) && seen.add(f.id));
  return rankResults(q, feeds, showFields, (f) => f.episodeCount || 0).slice(0, max);
});

// Episodes that mention a person or topic in their title, description or guest/host tags,
// best matches first (exact phrase beats scattered words), then newest.
export const searchEpisodes = cache(async (q, max = 40) => {
  const data = await call("/search/byperson", { q, max: Math.max(150, max), fulltext: "" });
  const seen = new Set();
  const items = (data.items || []).filter((e) => e && e.id && !seen.has(e.id) && seen.add(e.id));
  return rankResults(q, items, episodeFields, (e) => e.datePublished || 0).slice(0, max);
});

export const getShow = cache(async (id) => {
  const data = await call("/podcasts/byfeedid", { id });
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
  const feeds = await searchShows(title);
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
