"use client";
// Listening sync (step 8): sends where you stopped to your account, and reads it back, so another
// device can pick up where you left off. lib/progress.js stays the copy the player reads; this keeps
// it and the account's `listening_progress` rows in step. Signed out, nothing here runs.
//
// Newest wins: every row carries the time the device saved it, and on opening Hooked (or coming back
// to the tab) the player shows your newest row from any device, unless this device did something newer.

import { supabase } from "./supabase/client";
import { getState } from "./store";
import { ensureRefs } from "./catalog-client";
import { episodeOf, withEpisode } from "./log-episode";
import { allSpots, keysOf, lastAt, loadLast, mergeSpots, onProgressChange, setLastFrom } from "./progress";

const EVERY = 30_000; // while listening, send your spot at most every 30 seconds
const SLACK = 2_000; // two saves this close together count as the same moment (device clocks differ)
const OUR_ID = /^[a-z2-9]{8}$/;

const db = () => (getState()?.user ? supabase() : null);
const iso = (ms) => new Date(ms).toISOString();

// ---------- sending ----------
const dirty = new Map(); // episode key → { t, d, at }
let clearedAt = 0;
let timer = null;
let lastSent = 0;
let chain = Promise.resolve();

// Changes are kept even before we know whether you're signed in (a tap on Play right after the page
// opens), and sent once we do. Signed out, they're dropped.
onProgressChange((c) => {
  if (getState()?.ready && !getState()?.user) return;
  if (c.cleared) {
    clearedAt = c.at;
    return schedule(0);
  }
  if (c.last) {
    // A new episode in the player: send it right away, with its spot if there is one.
    const s = allSpots()[c.key];
    dirty.set(c.key, { t: s?.t || 0, d: s?.d || 0, at: c.at });
    return schedule(0);
  }
  dirty.set(c.key, { t: c.t, d: c.d, at: c.at });
  // Finished (back to 0) goes now; listening goes every 30 seconds.
  schedule(c.t === 0 ? 0 : Math.max(0, lastSent + EVERY - Date.now()));
});

function schedule(wait) {
  if (timer && wait > 0) return; // already coming
  clearTimeout(timer);
  timer = setTimeout(flushSpots, wait);
}

/** Send everything waiting now (the player calls this on pause and when you leave the page). */
export function flushSpots() {
  clearTimeout(timer);
  timer = null;
  chain = chain.then(send, send);
  return chain;
}

async function send() {
  if (!getState()?.ready) return schedule(1000); // still finding out who's signed in: try again shortly
  const client = db();
  const user = getState()?.user;
  if (!client || !user) {
    dirty.clear();
    clearedAt = 0;
    return;
  }
  if (!dirty.size && !clearedAt) return;
  lastSent = Date.now();
  const spots = [...dirty.entries()];
  dirty.clear();
  const cleared = clearedAt;
  clearedAt = 0;

  // Closed the player, or started a brief's cut: nothing is in the player any more.
  if (cleared) {
    await client.from("listening_progress").update({ in_player: false, updated_at: iso(cleared) }).eq("user_id", user.id).eq("in_player", true);
  }
  if (!spots.length) return;

  // Spots saved before we knew our id for the episode get it from the server first.
  const numbers = spots.map(([k]) => k).filter((k) => !OUR_ID.test(k));
  const ids = numbers.length ? (await ensureRefs({ episodeIds: numbers })).episodes : {};
  const last = loadLast();
  const lastKeys = last ? keysOf(last) : [];
  const rows = spots
    .map(([k, s]) => ({
      user_id: user.id,
      episode_ref: OUR_ID.test(k) ? k : ids[k],
      position: Math.max(0, Math.floor(s.t || 0)),
      duration: s.d ? Math.floor(s.d) : null,
      in_player: lastKeys.includes(k) && s.at >= cleared,
      updated_at: iso(s.at),
    }))
    .filter((r) => r.episode_ref);
  if (rows.length) await client.from("listening_progress").upsert(rows, { onConflict: "user_id,episode_ref" });
}

// ---------- reading ----------
/**
 * Bring this device up to date with your account. Returns what the player should show:
 *   { ep, at }   an episode from another device, newer than this one's player
 *   { ep: null } the player was closed (or the episode finished) on another device, more recently
 *   null         keep what's here
 * `playing` (the episode playing right now, if any) is left alone.
 */
export async function pullSpots(playing = null) {
  const client = db();
  const user = getState()?.user;
  if (!client || !user) return null;
  const { data, error } = await client
    .from("listening_progress")
    .select(`episode_ref, position, duration, in_player, updated_at, ${episodeOf("listening_progress")}`)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error || !data) return null; // e.g. the migration hasn't run yet: the player works as before

  const skip = playing ? keysOf(playing) : [];
  const remote = data.map((r) => ({ key: r.episode_ref, t: r.position, d: r.duration || 0, at: Date.parse(r.updated_at), row: r }));
  mergeSpots(remote.filter((r) => !skip.includes(r.key)));

  // Catch the account up on anything this device has that's newer (saved while signed out, offline, or
  // in the last few seconds before the page closed).
  const byKey = new Map(remote.map((r) => [r.key, r]));
  for (const [k, s] of Object.entries(allSpots())) {
    const r = byKey.get(k);
    if (!r || s.at > r.at + SLACK) dirty.set(k, s);
  }
  if (dirty.size) flushSpots();

  const newest = remote[0];
  if (playing || !newest || newest.at <= lastAt() + SLACK) return null;
  const ep = newest.row.in_player ? toEpisode(newest.row) : null;
  if (newest.row.in_player && !ep) return null; // no audio for it: leave the player alone
  setLastFrom(ep, newest.at);
  return { ep, at: newest.at };
}

// A row's episode in the shape the player uses.
function toEpisode(row) {
  const e = withEpisode(row);
  if (!e.audio) return null;
  return {
    id: e.episode_id ?? undefined,
    ref: e.episode_ref,
    showRef: e.show_ref || undefined,
    title: e.title,
    feedTitle: e.feed_title,
    feedId: e.feed_id ?? undefined,
    image: e.image,
    feedImage: e.feed_image,
    audio: e.audio,
    duration: e.duration || row.duration || 0,
  };
}
