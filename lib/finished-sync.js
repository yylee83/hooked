"use client";
// Keeps "Finished, not logged" (lib/finished.js) in step with your account's `finished_episodes` rows, so every
// device shows the same list. Signed out, nothing here runs. Newest change wins, by the time each device made it.

import { supabase } from "./supabase/client";
import { getState } from "./store";
import { ensureRefs } from "./catalog-client";
import { episodeOf, withEpisode } from "./log-episode";
import { FORGET, allFinished, mergeFinished, onFinishedChange } from "./finished";

const SLACK = 2_000; // two changes this close together count as the same moment (device clocks differ)
const OUR_ID = /^[a-z2-9]{8}$/;
const iso = (ms) => new Date(ms).toISOString();

const db = () => (getState()?.user ? supabase() : null);

// ---------- sending ----------
const dirty = new Map(); // episode key → entry, or null for "remove it"
let chain = Promise.resolve();

onFinishedChange((key, entry) => {
  if (getState()?.ready && !getState()?.user) return;
  dirty.set(key, entry);
  flush();
});

function flush() {
  chain = chain.then(send, send);
  return chain;
}

async function send() {
  if (!dirty.size) return;
  if (!getState()?.ready) return void setTimeout(flush, 1000); // still finding out who's signed in
  const client = db();
  const user = getState()?.user;
  if (!client || !user) return void dirty.clear();
  const items = [...dirty.entries()];
  dirty.clear();

  // Entries saved before we knew our id for the episode get it from the server first.
  const numbers = items.map(([k]) => k).filter((k) => !OUR_ID.test(k));
  const ids = numbers.length ? (await ensureRefs({ episodeIds: numbers })).episodes : {};
  const refOf = (k) => (OUR_ID.test(k) ? k : ids[k]);

  const gone = items.filter(([, e]) => !e).map(([k]) => refOf(k)).filter(Boolean);
  const rows = items
    .filter(([, e]) => e)
    .map(([k, e]) => ({
      user_id: user.id,
      episode_ref: refOf(k),
      finished_at: iso(e.at),
      skipped: e.stage === "gone",
      updated_at: iso(e.u || Date.now()),
    }))
    .filter((r) => r.episode_ref);
  if (gone.length) await client.from("finished_episodes").delete().eq("user_id", user.id).in("episode_ref", gone);
  if (rows.length) await client.from("finished_episodes").upsert(rows, { onConflict: "user_id,episode_ref" });
}

// ---------- reading ----------
/** Bring this device's list up to date with your account, and send the account anything newer from here. */
export async function pullFinished() {
  const client = db();
  const user = getState()?.user;
  if (!client || !user) return;
  const cutoff = iso(Date.now() - FORGET);
  const { data, error } = await client
    .from("finished_episodes")
    .select(`episode_ref, finished_at, skipped, updated_at, ${episodeOf("finished_episodes")}`)
    .eq("user_id", user.id)
    .gt("finished_at", cutoff)
    .limit(200);
  if (error || !data) return; // e.g. the migration hasn't run yet: the list stays on this device

  const remote = data.map((r) => ({
    key: r.episode_ref,
    ep: toEpisode(r),
    at: Date.parse(r.finished_at),
    stage: r.skipped ? "gone" : "later",
    u: Date.parse(r.updated_at),
  }));
  mergeFinished(remote);

  // Catch the account up on anything newer here (finished while signed out, offline, or in another tab).
  const byKey = new Map(remote.map((r) => [r.key, r]));
  for (const [k, e] of Object.entries(allFinished())) {
    const r = byKey.get(k);
    if (!r || (e.u || 0) > r.u + SLACK) dirty.set(k, e);
  }
  if (dirty.size) flush();

  // Forget rows past their time.
  client.from("finished_episodes").delete().eq("user_id", user.id).lt("finished_at", cutoff).then(() => {});
}

// A row's episode in the shape the player and lists use.
function toEpisode(row) {
  const e = withEpisode(row);
  if (!e.title) return null;
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
    duration: e.duration || 0,
  };
}
