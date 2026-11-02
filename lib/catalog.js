// Our own shows and episodes (see docs/DATA_MODEL.md).
// Saving a log, Up next item, send, pin or brief creates a basic entry by itself (a database trigger).
// These functions upgrade an entry with full details from Podcast Index. They only touch entries we
// already have, and skip ones refreshed in the last 6 hours, so they can't be used to fill the
// tables with junk or to hammer Podcast Index. Server only: they need the service key.
import "server-only";
import { cache } from "react";
import { after } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { publicDb } from "@/lib/supabase/public";
import { getEpisode, getShow, plainText, safe } from "@/lib/podcastindex";
import { notesToParagraphs } from "@/lib/notes";

export const FRESH_MS = 6 * 3600 * 1000;

const isFresh = (row) => row.source !== "legacy" && row.last_fetched_at && Date.now() - new Date(row.last_fetched_at).getTime() < FRESH_MS;
const text = (s, max) => (s ? String(s).slice(0, max) : null);
const int = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Math.round(Number(n)) : null);

// Save changes; if another show/episode already holds one of the "must be unique" outside ids
// (Podcast Index sometimes lists the same feed twice), save everything except those.
async function save(db, table, id, fields, uniqueKeys) {
  let { error } = await db.from(table).update(fields).eq("id", id);
  if (error?.code === "23505") {
    const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => !uniqueKeys.includes(k)));
    ({ error } = await db.from(table).update(rest).eq("id", id));
  }
  return !error;
}

/** Upgrade one of our shows from Podcast Index. Returns the row, or null if we don't have it. */
export async function refreshShow(feedId, { db = adminDb(), force = false } = {}) {
  if (!db || !/^\d+$/.test(String(feedId))) return null;
  const { data: row } = await db.from("shows").select("*").eq("podcastindex_id", feedId).maybeSingle();
  if (!row || (!force && isFresh(row))) return row;

  const now = new Date().toISOString();
  const feed = await getShow(feedId).catch(() => undefined);
  if (!feed) {
    // undefined = Podcast Index didn't answer; null = it doesn't know this show.
    await db.from("shows").update({ last_fetched_at: now, failures: (row.failures || 0) + 1, fetch_error: feed === null ? "not in Podcast Index" : "Podcast Index didn't answer" }).eq("id", row.id);
    return row;
  }
  const fields = {
    title: text(feed.title, 300) || row.title,
    author: text(feed.author || feed.ownerName, 300),
    description: text(plainText(feed.description || ""), 4000),
    image_url: feed.artwork || feed.image || row.image_url,
    website_url: text(feed.link, 1000),
    language: text(feed.language, 20),
    categories: Object.values(feed.categories || {}).slice(0, 10),
    feed_url: text(feed.url, 2000),
    podcast_guid: text(feed.podcastGuid, 200),
    apple_id: int(feed.itunesId),
    source: "podcastindex",
    last_fetched_at: now,
    fetch_error: null,
    failures: 0,
    updated_at: now,
  };
  await save(db, "shows", row.id, fields, ["feed_url", "podcast_guid", "apple_id"]);
  return { ...row, ...fields };
}

/** Upgrade one of our episodes (and its show) from Podcast Index. Returns the row, or null if we don't have it. */
export async function refreshEpisode(episodeId, { db = adminDb(), force = false } = {}) {
  if (!db || !/^\d+$/.test(String(episodeId))) return null;
  const { data: row } = await db.from("episodes").select("*").eq("podcastindex_id", episodeId).maybeSingle();
  if (!row || (!force && isFresh(row))) return row;

  const now = new Date().toISOString();
  const ep = await getEpisode(episodeId).catch(() => undefined);
  if (!ep) {
    await db.from("episodes").update({ last_fetched_at: now }).eq("id", row.id);
    return row;
  }
  if (ep.feedId) await refreshShow(ep.feedId, { db });

  const transcripts = Array.isArray(ep.transcripts) && ep.transcripts.length
    ? ep.transcripts.filter((t) => t?.url).map((t) => ({ url: t.url, type: t.type || "" }))
    : ep.transcriptUrl ? [{ url: ep.transcriptUrl, type: "" }] : [];
  const fields = {
    title: text(ep.title, 500) || row.title,
    guid: text(ep.guid, 500),
    published_at: ep.datePublished ? new Date(ep.datePublished * 1000).toISOString() : null,
    duration_seconds: int(ep.duration),
    image_url: ep.image || ep.feedImage || row.image_url,
    season: int(ep.season),
    episode_number: int(ep.episode),
    // Plain text with paragraph breaks. The feed's own HTML is never stored or shown.
    description_text: text(notesToParagraphs(ep.description || "").join("\n\n"), 20000),
    audio_url: text(ep.enclosureUrl, 2000) || row.audio_url,
    episode_url: text(ep.link, 2000),
    transcripts: transcripts.slice(0, 5),
    source: "podcastindex",
    last_fetched_at: now,
    updated_at: now,
  };
  await save(db, "episodes", row.id, fields, ["guid"]);
  return { ...row, ...fields };
}

/** For the daily job: upgrade basic entries and refresh stale ones, oldest first. */
export async function refreshStale({ limit = 40 } = {}) {
  const db = adminDb();
  if (!db) return { skipped: "no service key" };
  const cutoff = new Date(Date.now() - FRESH_MS).toISOString();
  const stale = (table) =>
    db.from(table).select("podcastindex_id").not("podcastindex_id", "is", null).lt("failures", 5)
      .or(`source.eq.legacy,last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`)
      .order("last_fetched_at", { ascending: true, nullsFirst: true }).limit(limit);
  const { data: eps } = await db.from("episodes").select("podcastindex_id").not("podcastindex_id", "is", null)
    .or(`source.eq.legacy,last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`)
    .order("last_fetched_at", { ascending: true, nullsFirst: true }).limit(limit);
  const { data: shows } = await stale("shows");
  let episodes = 0, showsDone = 0;
  for (const e of eps || []) if (await refreshEpisode(e.podcastindex_id, { db })) episodes++;
  for (const s of shows || []) if (await refreshShow(s.podcastindex_id, { db })) showsDone++;
  return { episodes, shows: showsDone };
}

// ---------- reading for pages ----------
// Pages read our tables first. They fall back to Podcast Index when we don't have an entry yet (and
// then save it in the background), or when ours is only a basic one. If Podcast Index is down or has
// lost the entry, a basic entry is still better than a dead page.

const stale = (row) => !row.last_fetched_at || Date.now() - new Date(row.last_fetched_at).getTime() > FRESH_MS;
const unix = (iso) => (iso ? Math.floor(new Date(iso).getTime() / 1000) : 0);

// Our rows, in the same shape Podcast Index uses, so pages and components don't need to change.
function asPiShow(s) {
  if (!s) return null;
  return {
    id: s.podcastindex_id, title: s.title, author: s.author, description: s.description || "",
    image: s.image_url, artwork: s.image_url, link: s.website_url, categories: s.categories || [],
    url: s.feed_url, itunesId: s.apple_id, ref: s.id,
  };
}
function asPiEpisode(e) {
  return {
    id: e.podcastindex_id, title: e.title, feedId: e.show?.podcastindex_id, feedTitle: e.show?.title || "",
    image: e.image_url || e.show?.image_url || "", feedImage: e.show?.image_url || "",
    enclosureUrl: e.audio_url || "", duration: e.duration_seconds || 0, datePublished: unix(e.published_at),
    description: e.description_text || "", link: e.episode_url, transcripts: e.transcripts || [], ref: e.id,
  };
}

// Save an episode someone opened that we don't have yet, then fill it in. Runs after the page is sent.
async function importEpisode(id, ep) {
  const db = adminDb();
  if (!db || !ep?.feedId) return;
  const { data: have } = await db.from("episodes").select("id").eq("podcastindex_id", id).maybeSingle();
  if (!have) {
    await db.from("shows").upsert(
      { podcastindex_id: ep.feedId, title: text(ep.feedTitle, 300) || "Untitled show", image_url: ep.feedImage || null, source: "legacy" },
      { onConflict: "podcastindex_id", ignoreDuplicates: true });
    const { data: show } = await db.from("shows").select("id").eq("podcastindex_id", ep.feedId).maybeSingle();
    if (!show) return;
    await db.from("episodes").upsert(
      { podcastindex_id: Number(id), show_id: show.id, title: text(ep.title, 500) || "Untitled episode", source: "legacy" },
      { onConflict: "podcastindex_id", ignoreDuplicates: true });
  }
  await refreshEpisode(id, { db, force: true });
}

async function importShow(feedId) {
  const db = adminDb();
  if (!db) return;
  const feed = await getShow(feedId).catch(() => null);
  if (!feed) return;
  await db.from("shows").upsert(
    { podcastindex_id: Number(feedId), title: text(feed.title, 300) || "Untitled show", source: "legacy" },
    { onConflict: "podcastindex_id", ignoreDuplicates: true });
  await refreshShow(feedId, { db, force: true });
}

/** An episode for its page: { data: { episode, show }, error, from }. Same shapes as Podcast Index. */
export const loadEpisode = cache(async (id) => {
  if (!/^\d{1,15}$/.test(String(id))) return { data: null, error: null };
  const db = publicDb();
  const { data: row } = db
    ? await db.from("episodes").select("*, show:shows(*)").eq("podcastindex_id", id).maybeSingle()
    : { data: null };
  if (row && row.source !== "legacy") {
    if (stale(row)) after(() => refreshEpisode(id).catch(() => {}));
    return { data: { episode: asPiEpisode(row), show: asPiShow(row.show) }, error: null, from: "hooked" };
  }
  const ep = await safe(getEpisode(id));
  if (ep.data) {
    after(() => importEpisode(id, ep.data).catch(() => {}));
    const { data: show } = await safe(getShow(ep.data.feedId));
    return { data: { episode: ep.data, show }, error: null, from: "podcastindex" };
  }
  if (row) return { data: { episode: asPiEpisode(row), show: asPiShow(row.show) }, error: null, from: "basic" };
  return { data: null, error: ep.error };
});

/** A show for its page: { data, error, from }. Same shape as Podcast Index. */
export const loadShow = cache(async (feedId) => {
  if (!/^\d{1,15}$/.test(String(feedId))) return { data: null, error: null };
  const db = publicDb();
  const { data: row } = db ? await db.from("shows").select("*").eq("podcastindex_id", feedId).maybeSingle() : { data: null };
  if (row && row.source !== "legacy") {
    if (stale(row)) after(() => refreshShow(feedId).catch(() => {}));
    return { data: asPiShow(row), error: null, from: "hooked" };
  }
  const show = await safe(getShow(feedId));
  if (show.data) {
    if (row) after(() => refreshShow(feedId, { force: true }).catch(() => {}));
    else after(() => importShow(feedId).catch(() => {}));
    return { data: show.data, error: null, from: "podcastindex" };
  }
  if (row) return { data: asPiShow(row), error: null, from: "basic" };
  return { data: null, error: show.error };
});
