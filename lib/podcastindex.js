// Talks to Podcast Index from the server only. Your secret never reaches the browser.
import "server-only";
import crypto from "crypto";
import { cache } from "react";

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
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Hooked/0.1 (hookedonpods.com)",
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

export const searchShows = cache(async (q) => {
  const data = await call("/search/byterm", { q, max: 25 });
  return data.feeds || [];
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
