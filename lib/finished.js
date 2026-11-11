"use client";
// Episodes you finished in Hooked's player but haven't logged yet, on this device.
// Finishing (the last minute counts) asks "Log it?" in the player (components/FinishPrompt.js). If you close
// that, or it finished while you weren't looking, the episode waits on Home for 3 days
// (components/FinishedNotLogged.js). Skipping it there, or logging it anywhere, ends it.
//
// Saved in localStorage as hooked:finished { [episode key]: { ep, at, stage } }, where stage is
//   "prompt"  asking in the player now
//   "later"   waiting on Home
//   "gone"    skipped: never asked about again (remembered for 30 days)

import { useSyncExternalStore } from "react";
import { keysOf } from "./progress";

const KEY = "hooked:finished";
const WAIT = 3 * 86400_000; // how long a finished episode waits on Home
const FORGET = 30 * 86400_000; // how long a skip is remembered
const EMPTY = {};

let cache = null; // { raw, all } so the snapshot stays the same object until something changes
const listeners = new Set();

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

function writeAll(all) {
  const now = Date.now();
  for (const [k, v] of Object.entries(all)) {
    if (now - v.at > (v.stage === "gone" ? FORGET : WAIT)) delete all[k];
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
  listeners.forEach((fn) => fn());
}

// Once per page load: a question left open when the page closed gets its second chance on Home, and
// anything past its time is forgotten.
let settled = false;
function settle() {
  if (settled || typeof window === "undefined") return;
  settled = true;
  const all = {};
  for (const [k, v] of Object.entries(readAll())) all[k] = v.stage === "prompt" ? { ...v, stage: "later" } : v;
  writeAll(all);
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
  const key = keysOf(ep)[0];
  if (!key) return;
  settle();
  const all = { ...readAll() };
  const next = fn(all[key]);
  if (next === undefined) return;
  if (next === null) delete all[key];
  else all[key] = next;
  writeAll(all);
}

/** The player finished an episode. Asks now if you're looking, otherwise it waits on Home. Once per episode. */
export function markFinished(ep) {
  const looking = typeof document === "undefined" || document.visibilityState === "visible";
  update(ep, (had) => (had ? undefined : { ep: slim(ep), at: Date.now(), stage: looking ? "prompt" : "later" }));
}

/** ✕ in the player (or it stepped aside): wait on Home instead. */
export const askLater = (ep) => update(ep, (had) => (had && had.stage !== "gone" ? { ...had, stage: "later" } : undefined));

/** Skip on Home: never ask about it again. */
export const skipFinished = (ep) => update(ep, (had) => (had ? { ...had, stage: "gone" } : undefined));

/** Logged: nothing more to ask. */
export const doneFinished = (ep) => update(ep, (had) => (had ? null : undefined));

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
    .filter((v) => v.stage !== "gone")
    .sort((a, b) => b.at - a.at);
}
