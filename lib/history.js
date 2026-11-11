"use client";
// Listening and search history, for the Hooked team (Erin and YY read it in Supabase; see
// supabase/migrations/20261112120000_listening_search_history.sql). Signed-in people only; nothing is ever read back.
//
// Listening: one session per stretch of playing one episode in the player. Pausing and coming back within 30 minutes
// is the same session. The player tells us when it plays, ticks and pauses (components/Player.js).
// Search: one row per search, plus the first result tapped (components/SearchRecorder.js).

import { supabase } from "./supabase/client";
import { getState } from "./store";
import { ensureRefs } from "./catalog-client";

const SAME_SESSION = 30 * 60_000; // coming back to the same episode within 30 minutes continues the session
const SAVE_EVERY = 60_000; // while playing, save at most once a minute (pausing or leaving saves right away)
const JUMP = 3; // a move forward of more than 3 seconds between ticks is a skip, not listening
const FINISH = 60; // the last minute counts as finished (as in the player)
const OUR_ID = /^[a-z2-9]{8}$/;

const db = () => (getState()?.user ? supabase() : null);
const uuid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null);

// ---------- listening ----------
let s = null; // the current session
let lastSave = 0;

const sameEp = (a, b) => (a?.ref && b?.ref ? a.ref === b.ref : a?.id != null && String(a.id) === String(b?.id));

/** The player started playing `ep` at `t` seconds. `source`: where it was started from (see the migration's list). */
export function listenPlay(ep, t, duration, source = "other") {
  if (!db() || !ep) return;
  const now = Date.now();
  if (s && sameEp(s.ep, ep) && now - s.lastActive < SAME_SESSION) {
    s.lastT = t;
    s.lastActive = now;
    return;
  }
  if (s) listenSave();
  const id = uuid();
  if (!id) return;
  s = { id, ep, source, startedAt: now, lastActive: now, start: t, lastT: t, end: t, max: t, heard: 0, skipped: 0, duration: duration || ep.duration || 0, finished: false };
}

/** The player moved to `t` while playing. */
export function listenTick(ep, t, duration) {
  if (!s || !sameEp(s.ep, ep)) return;
  const step = t - s.lastT;
  if (step > 0 && step <= JUMP) s.heard += step;
  else if (step > JUMP) s.skipped += step;
  s.lastT = t;
  s.end = t;
  s.max = Math.max(s.max, t);
  if (duration > 0) s.duration = duration;
  if (s.duration > FINISH && t >= s.duration - FINISH) s.finished = true;
  s.lastActive = Date.now();
  if (Date.now() - lastSave > SAVE_EVERY) listenSave();
}

/** Save the current session now (the player calls this on pause, at the end, and when you leave the page). */
export async function listenSave() {
  const cur = s;
  const client = db();
  if (!cur || !client) return;
  lastSave = Date.now();
  let ref = cur.ep.ref;
  if (!ref && cur.ep.id != null) ref = (await ensureRefs({ episodeIds: [cur.ep.id] }).catch(() => ({ episodes: {} }))).episodes[cur.ep.id];
  if (!ref || !OUR_ID.test(ref)) return;
  const n = (x) => Math.max(0, Math.round(x || 0));
  await client
    .rpc("record_listen", {
      p_id: cur.id,
      p_episode_ref: ref,
      p_started_at: new Date(cur.startedAt).toISOString(),
      p_ended_at: new Date(cur.lastActive).toISOString(),
      p_start_position: n(cur.start),
      p_end_position: n(cur.end),
      p_max_position: n(cur.max),
      p_duration: n(cur.duration),
      p_heard_seconds: n(cur.heard),
      p_skipped_seconds: n(cur.skipped),
      p_finished: cur.finished,
      p_source: cur.source,
    })
    .then(() => {}, () => {}); // before the migration runs, or offline: nothing breaks
}

// ---------- search ----------
const saving = new Map(); // search id → its save, so a quick tap waits for the search to be saved first

/** Save a search; returns its id (for the tap), or null when not signed in. */
export function recordSearch({ query, filter = "all", shows = 0, episodes = 0, people = 0, briefs = 0 }) {
  const client = db();
  const id = uuid();
  if (!client || !id || !String(query || "").trim()) return null;
  saving.set(
    id,
    client
      .rpc("record_search", { p_id: id, p_query: String(query).slice(0, 200), p_filter: filter, p_shows: shows, p_episodes: episodes, p_people: people, p_briefs: briefs })
      .then(() => {}, () => {})
  );
  return id;
}

/** The first result tapped after search `id`: kind is episode, show, person or brief; position starts at 1. */
export function recordSearchTap(id, kind, ref, position) {
  const client = db();
  if (!client || !id) return;
  (saving.get(id) || Promise.resolve()).then(() =>
    client.rpc("record_search_tap", { p_id: id, p_kind: kind, p_ref: String(ref || "").slice(0, 200), p_position: position }).then(() => {}, () => {})
  );
}
