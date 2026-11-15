"use client";
// Episodes you finished in Hooked's player but haven't logged yet.
// Finishing (the last minute counts) asks "Log it?" in the player (components/FinishPrompt.js). If you close
// that, or it finished while you weren't looking, the episode waits on My log for 3 days
// (components/FinishedNotLogged.js). Skipping it there, or logging it anywhere, ends it.
// Signed in, lib/finished-sync.js keeps this in step with your account (`finished_episodes`), so every device
// shows the same list.
//
// Saved in localStorage as hooked:finished { [episode key]: { ep, at, stage, u } }:
//   at     when it finished
//   stage  "prompt" asking in the player now (this device only), "later" waiting on My log,
//          "gone" skipped: never asked about again (remembered for 30 days)
//   u      when this entry last changed, so the newest change wins between devices

import { useSyncExternalStore } from "react";
import { keysOf } from "./progress";

const KEY = "hooked:finished";
export const WAIT = 3 * 86400_000; // how long a finished episode waits on My log
export const FORGET = 30 * 86400_000; // how long a skip is remembered
const EMPTY = {};

let cache = null; // { raw, all } so the snapshot stays the same object until something changes
const listeners = new Set();

// lib/finished-sync.js listens here for changes to send to your account: (key, entry or null).
let onChange = null;
export function onFinishedChange(fn) {
  onChange = fn;
}

function readAll() {
  let raw = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {}
  if (cache && cache.raw === raw) return cache.all;
  let all = EMPTY;
  try {
    all = raw ? JSON.parse(raw) : EMPTY;
  } catch {}
  cache = { raw, all };
  return all;
}

const expired = (v, now) => now - v.at > (v.stage === "gone" ? FORGET : WAIT);

function writeAll(all) {
  const now = Date.now();
  for (const [k, v] of Object.entries(all)) if (expired(v, now)) delete all[k];
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  listeners.forEach((fn) => fn());
}

// One episode can be known by our short id or by Podcast Index's number: the player may only have the number for
// an episode that's new to Hooked, while your account always uses our id. Entries are kept under our id once we
// know it, and found under either.
const OUR_ID = /^[a-z2-9]{8}$/;
const sameEp = (a, b) =>
  !!a && !!b && ((!!a.ref && a.ref === b.ref) || (a.id != null && b.id != null && String(a.id) === String(b.id)));

/** The key this episode is saved under in `all`, if any. */
function keyIn(all, ep) {
  for (const k of keysOf(ep)) if (all[k]) return k;
  return Object.keys(all).find((k) => sameEp(all[k].ep, ep)) || null;
}

// Copies of one episode under different keys (saved before this was fixed): keep one, under our id, newest change wins.
function foldCopies(all) {
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    const other = Object.keys(out).find((o) => sameEp(out[o].ep, v.ep));
    if (!other) {
      out[k] = v;
      continue;
    }
    const keep = (v.u || 0) >= (out[other].u || 0) ? v : out[other];
    const ep = v.ep?.ref ? { ...out[other].ep, ...v.ep } : { ...v.ep, ...out[other].ep };
    const key = OUR_ID.test(k) ? k : OUR_ID.test(other) ? other : k;
    delete out[other];
    out[key] = { ...keep, ep };
  }
  return out;
}

// Once per page load: a question left open when the page closed gets its second chance on My log, copies of one
// episode are joined, and anything past its time is forgotten.
let settled = false;
function settle() {
  if (settled || typeof window === "undefined") return;
  settled = true;
  const all = {};
  for (const [k, v] of Object.entries(readAll())) all[k] = v.stage === "prompt" ? { ...v, stage: "later" } : v;
  writeAll(foldCopies(all));
}

const slim = (ep) => ({
  id: ep.id,
  ref: ep.ref,
  showRef: ep.showRef,
  title: ep.title,
  feedTitle: ep.feedTitle,
  feedId: ep.feedId,
  image: ep.image,
  feedImage: ep.feedImage,
  audio: ep.audio,
  duration: ep.duration,
});

function update(ep, fn) {
  if (!keysOf(ep)[0]) return;
  settle();
  const all = { ...readAll() };
  const found = keyIn(all, ep);
  // Under our id when we know it (from this copy of the episode or the saved one).
  const ref = ep.ref || (found && all[found].ep?.ref);
  const key = ref || found || keysOf(ep)[0];
  const had = found ? all[found] : undefined;
  const next = fn(had);
  if (next === undefined) return;
  if (found && found !== key) delete all[found]; // moves to our id: your account already has it under that
  if (next === null) delete all[key];
  else all[key] = { ...next, ep: ref && next.ep && !next.ep.ref ? { ...next.ep, ref } : next.ep, u: Date.now() };
  writeAll(all);
  try {
    onChange?.(key, all[key] || null);
  } catch {}
}

/** The player finished an episode. Asks now if you're looking, otherwise it waits on My log. Once per episode. */
export function markFinished(ep) {
  const looking = typeof document === "undefined" || document.visibilityState === "visible";
  update(ep, (had) => (had ? undefined : { ep: slim(ep), at: Date.now(), stage: looking ? "prompt" : "later" }));
}

/** ✕ in the player (or it stepped aside): wait on My log instead. */
export const askLater = (ep) => update(ep, (had) => (had && had.stage !== "gone" ? { ...had, stage: "later" } : undefined));

/** Skip on My log: never ask about it again. */
export const skipFinished = (ep) => update(ep, (had) => (had ? { ...had, stage: "gone" } : undefined));

/** Logged: nothing more to ask. */
export const doneFinished = (ep) => update(ep, (had) => (had ? null : undefined));

/** Every entry on this device, for syncing: { [key]: { ep, at, stage, u } }. */
export const allFinished = () => readAll();

/** Entries from your account, kept where they changed more recently than this device's. Sends nothing back.
 *  rows: [{ key, ep, at, stage, u }] */
export function mergeFinished(rows) {
  settle();
  const all = { ...readAll() };
  let changed = false;
  for (const r of rows) {
    // This device may have the same episode under Podcast Index's number: join it to the account's copy.
    const found = all[r.key] ? r.key : keyIn(all, r.ep || { ref: r.key });
    const had = found ? all[found] : undefined;
    if (found && found !== r.key) {
      delete all[found];
      all[r.key] = { ...had, ep: { ...had.ep, ...r.ep } };
      changed = true;
    }
    if (had && had.u >= r.u) continue;
    // A question open in this device's player stays open here.
    all[r.key] = { ep: r.ep || had?.ep, at: r.at, stage: had?.stage === "prompt" && r.stage === "later" ? "prompt" : r.stage, u: r.u };
    changed = true;
  }
  if (changed) writeAll(all);
}

function subscribe(fn) {
  settle();
  listeners.add(fn);
  const onStorage = (e) => e.key === KEY && fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** Every finished episode still being asked about, newest first: [{ ep, at, stage }]. */
export function useFinished() {
  const all = useSyncExternalStore(subscribe, readAll, () => EMPTY);
  return Object.values(all)
    .filter((v) => v.stage !== "gone" && v.ep)
    .sort((a, b) => b.at - a.at);
}
