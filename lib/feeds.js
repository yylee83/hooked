// Read a podcast's own feed (RSS). Feeds are written by anyone, so:
// fetching goes through safeFetch (no private addresses, capped size and time), and nothing from a feed
// is ever put on a page as HTML: show notes become plain paragraphs with links (lib/notes.js).
import "server-only";
import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "@/lib/safe-fetch";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  // Some feeds repeat a tag once per item; always treat these as lists.
  isArray: (name) => ["item", "podcast:transcript", "itunes:category"].includes(name),
  // Don't turn guids or episode numbers into numbers (leading zeros, huge values).
  parseTagValue: false,
});

const str = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return String(v["#text"] ?? "").trim();
  return String(v).trim();
};
const int = (v) => {
  const n = parseInt(str(v), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "1:02:03", "62:03" or "3723" → seconds. */
export function durationSeconds(v) {
  const s = str(v);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s)) || null;
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((total, n) => total * 60 + n, 0) || null;
}

// Apple's category tags: <itunes:category text="Comedy"><itunes:category text="Improv"/></itunes:category>.
// Returns the names, main categories and sub-categories alike, e.g. ["Comedy", "Improv"].
function categoriesOf(list) {
  const names = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (c?.["@text"]) names.push(String(c["@text"]).trim());
    for (const sub of c?.["itunes:category"] || []) if (sub?.["@text"]) names.push(String(sub["@text"]).trim());
  }
  return [...new Set(names.filter(Boolean))].slice(0, 10);
}

/** Turn feed XML into { show, episodes }. Exported for tests. */
export function parseFeed(xml) {
  // Podcast feeds never need a DOCTYPE. Dropping it rules out entity tricks that balloon in size.
  const doc = parser.parse(String(xml).replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, ""));
  const ch = doc?.rss?.channel;
  if (!ch) return null;
  const show = {
    title: str(ch.title),
    author: str(ch["itunes:author"]) || str(ch["itunes:owner"]?.["itunes:name"]),
    description: str(ch["itunes:summary"]) || str(ch.description),
    image: ch["itunes:image"]?.["@href"] || str(ch.image?.url) || "",
    link: str(ch.link),
    language: str(ch.language),
    podcastGuid: str(ch["podcast:guid"]),
    categories: categoriesOf(ch["itunes:category"]),
  };
  const episodes = (ch.item || []).map((it) => {
    const enclosure = it.enclosure || {};
    return {
      guid: str(it.guid) || enclosure["@url"] || str(it.link) || str(it.title),
      title: str(it.title) || str(it["itunes:title"]),
      // The full notes (with links) are usually in content:encoded; description is often a short summary.
      notesHtml: str(it["content:encoded"]) || str(it.description) || str(it["itunes:summary"]),
      published: str(it.pubDate) ? new Date(str(it.pubDate)) : null,
      duration: durationSeconds(it["itunes:duration"]),
      audio: enclosure["@url"] || "",
      image: it["itunes:image"]?.["@href"] || "",
      link: str(it.link),
      season: int(it["itunes:season"]),
      number: int(it["itunes:episode"]),
      transcripts: (it["podcast:transcript"] || []).map((t) => ({ url: t["@url"] || "", type: t["@type"] || "" })).filter((t) => t.url),
    };
  });
  return { show, episodes };
}

/** Fetch and read a feed. Returns { show, episodes } or null. Big feeds are fine up to 25 MB. */
export async function readFeed(url) {
  try {
    const res = await safeFetch(url, {
      timeoutMs: 15000,
      maxBytes: 25_000_000,
      maxRedirects: 5,
      headers: { "User-Agent": "Hooked/1.0 (+https://hookedonpods.com)", Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) return null;
    return parseFeed(res.body.toString("utf8"));
  } catch {
    return null;
  }
}

/** The newest few episodes from the top of a feed, without downloading all of it (some feeds are 20 MB): reads the
 *  first `bytes`, keeps whole <item>s, and returns [{ guid, title, date (unix seconds), duration, audio, image }],
 *  newest first. For New episodes on Home (lib/catalog.js `feedNewest`). Null if the feed can't be read. */
export async function readFeedTop(url, { bytes = 600_000, max = 5, timeoutMs = 6000 } = {}) {
  try {
    const res = await safeFetch(url, {
      timeoutMs,
      maxBytes: bytes,
      truncate: true,
      maxRedirects: 5,
      headers: { "User-Agent": "Hooked/1.0 (+https://hookedonpods.com)", Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) return null;
    let xml = res.body.toString("utf8");
    const end = xml.indexOf("</channel>");
    if (end < 0) {
      // Cut off partway: keep the whole items and close the feed ourselves.
      const last = xml.lastIndexOf("</item>");
      if (last < 0) return null;
      xml = `${xml.slice(0, last + "</item>".length)}</channel></rss>`;
    }
    const feed = parseFeed(xml);
    if (!feed) return null;
    return feed.episodes
      .filter((e) => e.guid && e.title && e.audio && e.published && !isNaN(e.published))
      .map((e) => ({ guid: e.guid, title: e.title, date: Math.floor(e.published.getTime() / 1000), duration: e.duration || 0, audio: e.audio, image: e.image || "", notesHtml: e.notesHtml || "", link: e.link || "" }))
      .sort((a, b) => b.date - a.date)
      .slice(0, max);
  } catch {
    return null;
  }
}
