// What people are searching for right now, from Google Trends' public "Trending now" feed.
// Free, no key needed, updated through the day.
import "server-only";

const FEED = process.env.TRENDS_FEED_URL || "https://trends.google.com/trending/rss?geo=US";

const decode = (s = "") =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

function tag(xml, name) {
  const m = xml.match(new RegExp(`<(?:ht:)?${name}>([\\s\\S]*?)</(?:ht:)?${name}>`));
  return m ? decode(m[1]) : "";
}

export function parseTrends(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const news = [];
    for (const n of it.matchAll(/<(?:ht:)?news_item>([\s\S]*?)<\/(?:ht:)?news_item>/g)) {
      news.push({
        title: tag(n[1], "news_item_title"),
        url: tag(n[1], "news_item_url"),
        source: tag(n[1], "news_item_source"),
        picture: tag(n[1], "news_item_picture"),
      });
    }
    const title = tag(it, "title");
    if (!title) continue;
    items.push({
      topic: title,
      traffic: tag(it, "approx_traffic"),
      picture: tag(it, "picture"),
      date: tag(it, "pubDate"),
      news: news.filter((n) => n.title && n.url).slice(0, 3),
    });
  }
  return items;
}

async function fromGoogle() {
  try {
    const res = await fetch(FEED, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Hooked/0.1; +https://hookedonpods.com)" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    return parseTrends(await res.text());
  } catch {
    return [];
  }
}

// Backup: the most-read English Wikipedia articles yesterday, which track the news closely.
const SKIP = /^(main page|special:|wikipedia:|portal:|file:|deaths in|list of|\d{4} in )/i;
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M+` : n >= 1e3 ? `${Math.round(n / 1e3)}K+` : String(n));

async function fromWikipedia() {
  try {
    const d = new Date(Date.now() - 24 * 3600 * 1000);
    const path = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
    const res = await fetch(process.env.WIKI_FEED_URL || `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${path}`, {
      headers: { "User-Agent": "Hooked/0.1 (https://hookedonpods.com)" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.mostread?.articles || [])
      .filter((a) => a.normalizedtitle && !SKIP.test(a.normalizedtitle) && a.namespace?.id !== -1)
      .map((a) => ({
        topic: a.normalizedtitle,
        traffic: a.views ? `${compact(a.views)} reads` : "",
        picture: a.thumbnail?.source || "",
        date: "",
        news: a.content_urls?.desktop?.page ? [{ title: a.description || "Read the background", url: a.content_urls.desktop.page, source: "Wikipedia" }] : [],
        source: "wikipedia",
      }));
  } catch {
    return [];
  }
}

export async function trendingTopics(limit = 20) {
  const google = await fromGoogle();
  if (google.length) return google.slice(0, limit);
  return (await fromWikipedia()).slice(0, limit);
}
