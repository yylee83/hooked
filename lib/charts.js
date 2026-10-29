// Real "what's popular" data.
// 1) Apple Podcasts' official US Top Shows chart (free public feed, updated daily).
// 2) What people are actually logging on Hooked on.
import "server-only";
import { cache } from "react";
import { getEpisodes, getShowByItunesId, safe } from "./podcastindex";
import { publicDb } from "./supabase/public";

const APPLE = process.env.CHARTS_FEED_URL || "https://rss.marketingtools.apple.com/api/v2/us/podcasts/top/50/podcasts.json";
const APPLE_OLD = "https://itunes.apple.com/us/rss/toppodcasts/limit=50/json";

const bigArt = (url = "") => url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, "/600x600bb.$2");

async function fromApple() {
  try {
    const res = await fetch(APPLE, { signal: AbortSignal.timeout(6000), next: { revalidate: 21600 } });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return (data.feed?.results || []).map((r) => ({
      itunesId: String(r.id),
      title: r.name,
      author: r.artistName,
      image: bigArt(r.artworkUrl100 || ""),
      genre: r.genres?.[0]?.name || "",
      appleUrl: r.url,
    }));
  } catch {
    // Apple's older chart feed, as a backup.
    try {
      const res = await fetch(APPLE_OLD, { signal: AbortSignal.timeout(6000), next: { revalidate: 21600 } });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.feed?.entry || []).map((e) => ({
        itunesId: e.id?.attributes?.["im:id"],
        title: e["im:name"]?.label,
        author: e["im:artist"]?.label,
        image: bigArt(e["im:image"]?.[e["im:image"].length - 1]?.label || ""),
        genre: e.category?.attributes?.label || "",
        appleUrl: e.link?.attributes?.href,
      }));
    } catch {
      return [];
    }
  }
}

// Top shows on Apple Podcasts, matched to Podcast Index so they open in Hooked on.
export const topCharts = cache(async (limit = 20) => {
  const list = (await fromApple()).filter((s) => s.itunesId && s.title).slice(0, limit);
  const matched = await Promise.all(
    list.map(async (s, i) => {
      const { data: feed } = await safe(getShowByItunesId(s.itunesId));
      return { ...s, rank: i + 1, feedId: feed?.id || null, image: s.image || feed?.artwork || feed?.image || "" };
    })
  );
  return matched;
});

// Most-logged shows on Hooked on over the last `days` days.
export const popularOnHooked = cache(async (days = 30, limit = 12) => {
  const db = publicDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("logs")
    .select("user_id, feed_id, feed_title, feed_image, image, hooked, rating, logged_at")
    .gte("logged_at", since)
    .not("feed_id", "is", null)
    .order("logged_at", { ascending: false })
    .limit(2000);
  const byShow = new Map();
  for (const l of data || []) {
    const k = String(l.feed_id);
    if (!byShow.has(k)) byShow.set(k, { feedId: l.feed_id, title: l.feed_title, image: l.feed_image || l.image, people: new Set(), logs: 0, hooked: 0, ratings: [] });
    const s = byShow.get(k);
    s.logs++;
    s.people.add(l.user_id);
    if (l.hooked) s.hooked++;
    if (l.rating > 0) s.ratings.push(Number(l.rating));
  }
  return [...byShow.values()]
    .map((s) => ({
      feedId: s.feedId,
      title: s.title,
      image: s.image,
      listeners: s.people.size,
      logs: s.logs,
      hookedPct: Math.round((s.hooked / s.logs) * 100),
      avg: s.ratings.length ? s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length : 0,
    }))
    .sort((a, b) => b.listeners - a.listeners || b.logs - a.logs || b.avg - a.avg)
    .slice(0, limit);
});

// The newest episode from each show on Apple's top chart, in chart order.
// `count` = how many episodes to return (each comes from a different top show).
export const topChartEpisodes = cache(async (count = 10) => {
  const shows = (await topCharts(50)).filter((s) => s.feedId).slice(0, count);
  const eps = await Promise.all(
    shows.map(async (s) => {
      const { data } = await safe(getEpisodes(s.feedId, 1));
      const e = data?.[0];
      return e ? { ...e, feedTitle: e.feedTitle || s.title, feedImage: e.feedImage || s.image, chartRank: s.rank } : null;
    })
  );
  return { episodes: eps.filter(Boolean), more: shows.length === count && count < 50 };
});
