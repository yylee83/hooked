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
import { readFeed } from "@/lib/feeds";
import { norm } from "@/lib/rank";

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

// The show's own feed has the full notes (with links) and sometimes better details than Podcast Index.
// One download per show per run: `feeds` is shared across a batch, like the daily job.
async function fromFeed(db, showId, guid, feeds) {
  if (!guid) return null;
  const { data: show } = await db.from("shows").select("feed_url").eq("id", showId).maybeSingle();
  if (!show?.feed_url) return null;
  if (!feeds.has(show.feed_url)) feeds.set(show.feed_url, readFeed(show.feed_url));
  const feed = await feeds.get(show.feed_url);
  return feed?.episodes.find((e) => e.guid === guid) || null;
}

/** Upgrade one of our episodes (and its show) from Podcast Index, then from the show's own feed.
 *  Returns the row, or null if we don't have it. */
export async function refreshEpisode(episodeId, { db = adminDb(), force = false, feeds = new Map() } = {}) {
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
  // Full notes and anything Podcast Index left out, from the show's own feed.
  const item = await fromFeed(db, row.show_id, fields.guid, feeds).catch(() => null);
  if (item) {
    const notes = notesToParagraphs(item.notesHtml).join("\n\n");
    if (notes.length >= (fields.description_text || "").length * 0.8) fields.description_text = text(notes, 20000);
    fields.audio_url ||= text(item.audio, 2000);
    fields.duration_seconds ||= item.duration;
    fields.episode_url ||= text(item.link, 2000);
    if (!fields.transcripts.length && item.transcripts.length) fields.transcripts = item.transcripts.slice(0, 5);
    fields.source = "podcastindex"; // still matched through Podcast Index; "feed" is for shows it doesn't have
  }
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
  const feeds = new Map(); // each show's feed is downloaded once per run
  for (const e of eps || []) if (await refreshEpisode(e.podcastindex_id, { db, feeds })) episodes++;
  for (const s of shows || []) if (await refreshShow(s.podcastindex_id, { db })) showsDone++;
  // Shows that come from their own feed: re-read a few, to pick up new episodes.
  const { data: feedShows } = await db.from("shows").select("feed_url, apple_id").eq("source", "feed").lt("failures", 5)
    .or(`last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`).order("last_fetched_at", { ascending: true, nullsFirst: true }).limit(5);
  let feedsDone = 0;
  for (const f of feedShows || []) if (await importFeedShow({ feedUrl: f.feed_url, appleId: f.apple_id }).catch(() => null)) feedsDone++;
  return { episodes, shows: showsDone, feeds: feedsDone };
}

// ---------- shows Podcast Index lacks (or has broken) ----------
// We read the show's own feed. The feed address always comes from Apple's listing, never from what
// someone typed, so nobody can point the server at an arbitrary address or fill the tables with junk.

const FEED_EPISODES = 300; // newest episodes saved per feed read

const sameTitle = (a, b) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) > 12 && (x.includes(y) || y.includes(x))));
};

/** Our show for a feed Apple lists. Reads the feed (unless we read it in the last 6 hours), saves the
 *  show and its newest episodes, and returns our show id. Null if the feed can't be read. */
export async function importFeedShow({ feedUrl, appleId, force = false } = {}) {
  const db = adminDb();
  if (!db || !/^https?:\/\//i.test(feedUrl || "")) return null;
  const find = async (col, v) => (v ? (await db.from("shows").select("*").eq(col, v).maybeSingle()).data : null);
  let row = (await find("apple_id", int(appleId))) || (await find("feed_url", feedUrl));
  if (row && !force && row.source === "feed" && isFresh(row)) return row.id;

  const now = new Date().toISOString();
  const feed = await readFeed(feedUrl);
  if (!feed?.show) {
    if (row) await db.from("shows").update({ last_fetched_at: now, failures: (row.failures || 0) + 1, fetch_error: "feed unreadable" }).eq("id", row.id);
    return row?.id || null;
  }
  if (!row && feed.show.podcastGuid) row = await find("podcast_guid", feed.show.podcastGuid);

  const fields = {
    title: text(feed.show.title, 300) || row?.title || "Untitled show",
    author: text(feed.show.author, 300),
    description: text(notesToParagraphs(feed.show.description || "").join("\n\n"), 4000),
    image_url: feed.show.image || row?.image_url || null,
    website_url: text(feed.show.link, 1000),
    language: text(feed.show.language, 20),
    // Keep what we had (e.g. from Podcast Index) if the feed doesn't list any.
    categories: feed.show.categories.length ? feed.show.categories : row?.categories || [],
    feed_url: text(feedUrl, 2000),
    podcast_guid: text(feed.show.podcastGuid, 200),
    apple_id: int(appleId),
    last_fetched_at: now,
    fetch_error: null,
    failures: 0,
    updated_at: now,
  };
  let showId = row?.id;
  if (row) {
    // A show Podcast Index still serves keeps that as its source; otherwise it now comes from its feed.
    await save(db, "shows", row.id, { ...fields, source: row.source === "podcastindex" ? "podcastindex" : "feed" }, ["feed_url", "podcast_guid", "apple_id"]);
  } else {
    const { data, error } = await db.from("shows").insert({ ...fields, source: "feed" }).select("id").single();
    if (error) return (await find("feed_url", feedUrl))?.id || null; // someone saved it at the same moment
    showId = data.id;
  }

  // The newest episodes. Ones we already have (same id inside the feed) are left as they are.
  const rows = feed.episodes
    .filter((e) => e.guid && e.title)
    .slice(0, FEED_EPISODES)
    .map((e) => ({
      show_id: showId,
      guid: text(e.guid, 500),
      title: text(e.title, 500),
      published_at: e.published && !isNaN(e.published) ? e.published.toISOString() : null,
      duration_seconds: e.duration,
      image_url: e.image || fields.image_url,
      audio_url: text(e.audio, 2000),
      episode_url: text(e.link, 2000),
      season: e.season,
      episode_number: e.number,
      description_text: text(notesToParagraphs(e.notesHtml).join("\n\n"), 20000),
      transcripts: e.transcripts.slice(0, 5),
      source: "feed",
      last_fetched_at: now,
    }));
  for (let i = 0; i < rows.length; i += 100) {
    await db.from("episodes").upsert(rows.slice(i, i + 100), { onConflict: "show_id,guid", ignoreDuplicates: true });
  }
  return showId;
}

/** Our episode within one of our shows, matched by its id inside the feed, or else its title. */
export async function findShowEpisode(showId, { guid, title } = {}) {
  const db = publicDb();
  if (!db || !REF.test(String(showId))) return null;
  if (guid) {
    const { data } = await db.from("episodes").select("id").eq("show_id", showId).eq("guid", guid).maybeSingle();
    if (data) return data.id;
  }
  if (!title) return null;
  const { data } = await db.from("episodes").select("id, title").eq("show_id", showId).order("published_at", { ascending: false, nullsFirst: false }).limit(500);
  return (data || []).find((e) => sameTitle(e.title, title))?.id || null;
}

const SPOTIFY_ID = /^[A-Za-z0-9]{10,40}$/;

/** A basic entry for a Spotify episode that has no public feed anywhere: title, show, cover and a
 *  Spotify link. It can be logged and reviewed, but not played here. Returns our episode id. */
export async function spotifyEpisode({ episodeId, showId, title, showTitle, image } = {}) {
  const db = adminDb();
  if (!db || !SPOTIFY_ID.test(episodeId || "") || !title) return null;
  const have = async (table, col, v) => (v ? (await db.from(table).select("id").eq(col, v).maybeSingle()).data?.id : null);
  const existing = await have("episodes", "spotify_id", episodeId);
  if (existing) return existing;

  const name = text(showTitle, 300) || "Unknown show";
  let show = SPOTIFY_ID.test(showId || "") ? await have("shows", "spotify_id", showId) : null;
  if (!show) {
    const { data } = await db.from("shows").select("id").eq("source", "spotify").eq("title", name).limit(1).maybeSingle();
    show = data?.id || null;
  }
  if (!show) {
    const { data } = await db.from("shows").insert({
      title: name, image_url: image || null, source: "spotify",
      spotify_id: SPOTIFY_ID.test(showId || "") ? showId : null,
      website_url: SPOTIFY_ID.test(showId || "") ? `https://open.spotify.com/show/${showId}` : null,
      last_fetched_at: new Date().toISOString(),
    }).select("id").single();
    show = data?.id || (await have("shows", "spotify_id", showId));
  }
  if (!show) return null;
  const { data, error } = await db.from("episodes").insert({
    show_id: show, title: text(title, 500), image_url: image || null, spotify_id: episodeId,
    episode_url: `https://open.spotify.com/episode/${episodeId}`, source: "spotify",
    last_fetched_at: new Date().toISOString(),
  }).select("id").single();
  return error ? await have("episodes", "spotify_id", episodeId) : data.id;
}

/** A Spotify show with no public feed: a basic entry so its page works. Returns our show id. */
export async function spotifyShow({ showId, title, image } = {}) {
  const db = adminDb();
  if (!db || !SPOTIFY_ID.test(showId || "") || !title) return null;
  const { data: have } = await db.from("shows").select("id").eq("spotify_id", showId).maybeSingle();
  if (have) return have.id;
  const { data } = await db.from("shows").insert({
    title: text(title, 300), image_url: image || null, source: "spotify", spotify_id: showId,
    website_url: `https://open.spotify.com/show/${showId}`, last_fetched_at: new Date().toISOString(),
  }).select("id").single();
  return data?.id || null;
}

/** A show's newest episodes from our own tables (for shows Podcast Index doesn't serve). */
export async function ownShowEpisodes(showId, limit = 30) {
  const db = publicDb();
  if (!db || !REF.test(String(showId))) return [];
  const { data } = await db.from("episodes").select("*, show:shows(*)").eq("show_id", showId)
    .order("published_at", { ascending: false, nullsFirst: false }).limit(limit);
  return (data || []).map(asPiEpisode);
}

/** Shows we saved from their own feeds or Spotify whose title matches, for search. */
export async function searchOwnShows(query, limit = 5) {
  const db = publicDb();
  const q = String(query || "").trim().replace(/[%_,()]/g, " ").slice(0, 80);
  if (!db || q.length < 2) return [];
  const { data } = await db.from("shows").select("*").in("source", ["feed", "spotify"]).ilike("title", `%${q}%`).limit(limit);
  return (data || []).map(asPiShow);
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
    url: s.feed_url, itunesId: s.apple_id, ref: s.id, source: s.source,
  };
}
function asPiEpisode(e) {
  return {
    id: e.podcastindex_id, title: e.title, feedId: e.show?.podcastindex_id, feedTitle: e.show?.title || "",
    image: e.image_url || e.show?.image_url || "", feedImage: e.show?.image_url || "",
    enclosureUrl: e.audio_url || "", duration: e.duration_seconds || 0, datePublished: unix(e.published_at),
    description: e.description_text || "", link: e.episode_url, transcripts: e.transcripts || [], ref: e.id,
    showRef: e.show?.id,
  };
}

// Our short ids: 8 characters from an alphabet without look-alikes (see new_ref() in the migrations).
export const REF = /^[a-z2-9]{8}$/;
const PI_ID = /^\d{1,15}$/;

// Create a basic entry for a Podcast Index episode (and its show) and return our id.
// Full details are filled in after the page is sent.
// A failed write says why in the logs (each step's own error), instead of only "no row" at the end.
const logFail = (what, id, error) => error && console.error(`[catalog] ${what} failed`, id, error.code || "", error.message);

async function createEpisodeRow(db, id, ep) {
  if (!db) return void console.warn("[catalog] can't save episodes: SUPABASE_SERVICE_ROLE_KEY isn't set");
  if (!ep?.feedId) return null;
  const { data: have } = await db.from("episodes").select("id").eq("podcastindex_id", id).maybeSingle();
  if (have) return have.id;
  const s1 = await db.from("shows").upsert(
    { podcastindex_id: ep.feedId, title: text(ep.feedTitle, 300) || "Untitled show", image_url: ep.feedImage || null, source: "legacy" },
    { onConflict: "podcastindex_id", ignoreDuplicates: true });
  logFail("show save", ep.feedId, s1.error);
  const { data: show, error: s2 } = await db.from("shows").select("id").eq("podcastindex_id", ep.feedId).maybeSingle();
  logFail("show read", ep.feedId, s2);
  if (!show) return null;
  const e1 = await db.from("episodes").upsert(
    { podcastindex_id: Number(id), show_id: show.id, title: text(ep.title, 500) || "Untitled episode",
      image_url: ep.image || ep.feedImage || null, audio_url: ep.enclosureUrl || null, duration_seconds: int(ep.duration), source: "legacy" },
    { onConflict: "podcastindex_id", ignoreDuplicates: true });
  logFail("episode save", id, e1.error);
  if (!e1.error) console.warn("[catalog] episode save response", id, e1.status, e1.statusText, JSON.stringify(e1.data)?.slice(0, 200), e1.count);
  const { data: row, error } = await db.from("episodes").select("id").eq("podcastindex_id", id).maybeSingle();
  if (!row) console.error("[catalog] episode not created", id, error?.message || "no row");
  return row?.id || null;
}

async function createShowRow(db, feedId, feed) {
  if (!db) return void console.warn("[catalog] can't save shows: SUPABASE_SERVICE_ROLE_KEY isn't set");
  if (!feed) return null;
  const s1 = await db.from("shows").upsert(
    { podcastindex_id: Number(feedId), title: text(feed.title, 300) || "Untitled show", image_url: feed.artwork || feed.image || null, source: "legacy" },
    { onConflict: "podcastindex_id", ignoreDuplicates: true });
  logFail("show save", feedId, s1.error);
  const { data: row, error } = await db.from("shows").select("id").eq("podcastindex_id", feedId).maybeSingle();
  logFail("show read", feedId, error);
  return row?.id || null;
}

/** Our short id for a Podcast Index episode number, creating a basic entry if we don't have one. */
export const episodeRefFor = cache(async (id) => {
  if (!PI_ID.test(String(id))) return null;
  const { data: row } = (await publicDb()?.from("episodes").select("id").eq("podcastindex_id", id).maybeSingle()) || {};
  if (row) return row.id;
  const ep = await getEpisode(id).catch(() => null);
  const ref = await createEpisodeRow(adminDb(), id, ep).catch((e) => (console.error("[catalog] creating episode", id, e?.message), null));
  if (ref) after(() => refreshEpisode(id, { force: true }).catch(() => {}));
  return ref;
});

/** Our short id for a Podcast Index show number, creating a basic entry if we don't have one. */
export const showRefFor = cache(async (feedId) => {
  if (!PI_ID.test(String(feedId))) return null;
  const { data: row } = (await publicDb()?.from("shows").select("id").eq("podcastindex_id", feedId).maybeSingle()) || {};
  if (row) return row.id;
  const feed = await getShow(feedId).catch(() => null);
  const ref = await createShowRow(adminDb(), feedId, feed).catch((e) => (console.error("[catalog] creating show", feedId, e?.message), null));
  if (ref) after(() => refreshShow(feedId, { force: true }).catch(() => {}));
  return ref;
});

// Our short ids for Podcast Index numbers we already have, one lookup per table (at most 200 of each).
// Only reads: anything we don't have yet keeps its number, which redirects (and creates the entry) when opened.
async function refMaps(episodeIds = [], feedIds = []) {
  const uniq = (xs) => [...new Set(xs.filter((x) => PI_ID.test(String(x))).map(Number))].slice(0, 200);
  const eps = uniq(episodeIds);
  const feeds = uniq(feedIds);
  const db = publicDb();
  const none = { data: [] };
  if (!db || (!eps.length && !feeds.length)) return { episodes: new Map(), shows: new Map() };
  const [e, s] = await Promise.all([
    eps.length ? db.from("episodes").select("id, podcastindex_id").in("podcastindex_id", eps) : none,
    feeds.length ? db.from("shows").select("id, podcastindex_id").in("podcastindex_id", feeds) : none,
  ]).catch(() => [none, none]);
  const toMap = (rows) => new Map((rows || []).map((r) => [String(r.podcastindex_id), r.id]));
  return { episodes: toMap(e.data), shows: toMap(s.data) };
}

/** Episode cards from Podcast Index, with our short ids added as `ref` and `showRef` where we have them. */
export async function withRefs(cards) {
  const list = (cards || []).filter(Boolean);
  const m = await refMaps(list.filter((c) => !c.ref).map((c) => c.id), list.filter((c) => !c.showRef).map((c) => c.feedId));
  return list.map((c) => ({
    ...c,
    ...(!c.ref && m.episodes.has(String(c.id)) ? { ref: m.episodes.get(String(c.id)) } : {}),
    ...(!c.showRef && m.shows.has(String(c.feedId)) ? { showRef: m.shows.get(String(c.feedId)) } : {}),
  }));
}

/** Shows (anything with a Podcast Index number under `key`), with our short id added as `showRef`. */
export async function withShowRefs(items, key = "feedId") {
  const list = (items || []).filter(Boolean);
  const m = await refMaps([], list.filter((x) => !x.showRef).map((x) => x[key]));
  return list.map((x) => (!x.showRef && m.shows.has(String(x[key])) ? { ...x, showRef: m.shows.get(String(x[key])) } : x));
}

/** An episode for its page, by our short id or a Podcast Index number: { data: { episode, show }, error, from }.
 *  Same shapes as Podcast Index (with `ref` added). */
export const loadEpisode = cache(async (key) => {
  const byRef = REF.test(String(key));
  if (!byRef && !PI_ID.test(String(key))) return { data: null, error: null };
  const db = publicDb();
  const { data: row } = db
    ? await db.from("episodes").select("*, show:shows(*)").eq(byRef ? "id" : "podcastindex_id", key).maybeSingle()
    : { data: null };
  if (byRef && !row) return { data: null, error: null };
  const id = byRef ? row.podcastindex_id : key;
  if (row && (row.source !== "legacy" || !id)) {
    if (id && stale(row)) after(() => refreshEpisode(id).catch(() => {}));
    return { data: { episode: asPiEpisode(row), show: asPiShow(row.show) }, error: null, from: "hooked" };
  }
  const ep = await safe(getEpisode(id));
  if (ep.data) {
    if (row) after(() => refreshEpisode(id, { force: true }).catch(() => {}));
    else after(() => createEpisodeRow(adminDb(), id, ep.data).then((r) => r && refreshEpisode(id, { force: true })).catch(() => {}));
    const { data: show } = await safe(getShow(ep.data.feedId));
    return { data: { episode: { ...ep.data, ref: row?.id, showRef: row?.show?.id }, show: show && { ...show, ref: row?.show?.id } }, error: null, from: "podcastindex" };
  }
  if (row) return { data: { episode: asPiEpisode(row), show: asPiShow(row.show) }, error: null, from: "basic" };
  return { data: null, error: ep.error };
});

/** A show for its page, by our short id or a Podcast Index number: { data, error, from }. */
export const loadShow = cache(async (key) => {
  const byRef = REF.test(String(key));
  if (!byRef && !PI_ID.test(String(key))) return { data: null, error: null };
  const db = publicDb();
  const { data: row } = db ? await db.from("shows").select("*").eq(byRef ? "id" : "podcastindex_id", key).maybeSingle() : { data: null };
  if (byRef && !row) return { data: null, error: null };
  const feedId = byRef ? row.podcastindex_id : key;
  if (row && (row.source !== "legacy" || !feedId)) {
    if (stale(row)) {
      if (row.source === "feed") after(() => importFeedShow({ feedUrl: row.feed_url, appleId: row.apple_id }).catch(() => {}));
      else if (feedId) after(() => refreshShow(feedId).catch(() => {}));
    }
    return { data: asPiShow(row), error: null, from: "hooked" };
  }
  const show = await safe(getShow(feedId));
  if (show.data) {
    if (row) after(() => refreshShow(feedId, { force: true }).catch(() => {}));
    else after(() => createShowRow(adminDb(), feedId, show.data).then((r) => r && refreshShow(feedId, { force: true })).catch(() => {}));
    return { data: { ...show.data, ref: row?.id }, error: null, from: "podcastindex" };
  }
  if (row) return { data: asPiShow(row), error: null, from: "basic" };
  return { data: null, error: show.error };
});
