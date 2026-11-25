"use client";
// Downloads: episodes saved on this phone or computer, to play with no signal (YY, 2026-11-25).
//
// The audio is fetched straight from the show's own host by the browser (never through our server, so the show's
// download counts stay right and we don't re-host anyone's audio), then kept in the browser's Cache Storage under
// /downloads/audio/<our id>. Our service worker (public/sw.js) answers that address from the saved copy, including
// the byte-range requests iPhone Safari makes for audio. With no signal at all, the service worker shows
// public/offline.html, a small page that plays your downloads.
//
// What's saved where, all on the device only (nothing goes to Supabase):
//   Cache Storage "hooked-downloads-v1"  /downloads/audio/<key> → the audio file
//   localStorage "hooked:downloads"     { [key]: { key, ref, id, title, feedTitle, image, audio, duration, size, at } }
//
// Some hosts don't let other websites save their files (no CORS); those say "Can't save this one" and still stream.
import { useSyncExternalStore } from "react";

export const DL_CACHE = "hooked-downloads-v1";
const META = "hooked:downloads";
const audioPath = (key) => `/downloads/audio/${encodeURIComponent(key)}`;
export const downloadKey = (ep) => String(ep?.ref || ep?.id || "");

// Can this browser save downloads? (Needs Cache Storage and a service worker; every current phone browser has both.)
export function canDownload() {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator && window.isSecureContext;
}

function readMeta() {
  try {
    return JSON.parse(window.localStorage.getItem(META) || "{}") || {};
  } catch {
    return {};
  }
}
function writeMeta(all) {
  try {
    window.localStorage.setItem(META, JSON.stringify(all));
  } catch {}
}

// Downloads in progress: { [key]: { pct, abort } } or { [key]: { error } }.
let active = {};
let snapshot = { saved: {}, active };
const listeners = new Set();
function emit() {
  snapshot = { saved: typeof window === "undefined" ? {} : readMeta(), active: { ...active } };
  listeners.forEach((fn) => fn());
}
function subscribe(fn) {
  listeners.add(fn);
  if (listeners.size === 1) {
    emit();
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}
const onStorage = (e) => e.key === META && emit();
const EMPTY = { saved: {}, active: {} };

// { saved, active } for components.
export function useDownloads() {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

// The state of one episode: "saved", "saving" (with pct), "error" (with why), or "none".
export function downloadState(dl, ep) {
  const key = downloadKey(ep);
  if (!key) return { state: "none" };
  if (dl.active[key]?.error) return { state: "error", why: dl.active[key].error };
  if (dl.active[key]) return { state: "saving", pct: dl.active[key].pct };
  if (dl.saved[key]) return { state: "saved", size: dl.saved[key].size };
  return { state: "none" };
}

// Where the player should load an episode from: the saved copy when there is one and the service worker is ready
// to hand it over, otherwise null (stream as usual). The original address rides along, so if the saved copy has been
// cleared by the browser, the service worker sends the player to the stream instead.
export function localAudioUrl(ep) {
  if (typeof window === "undefined" || !navigator.serviceWorker?.controller) return null;
  const key = downloadKey(ep);
  if (!key || !readMeta()[key]) return null;
  return `${audioPath(key)}?u=${encodeURIComponent(ep.audio || "")}`;
}

const slim = (ep, size) => ({
  key: downloadKey(ep),
  ref: ep.ref || null,
  id: ep.id ?? null,
  title: ep.title || "",
  feedTitle: ep.feedTitle || "",
  image: ep.image || ep.feedImage || "",
  audio: ep.audio,
  duration: ep.duration || 0,
  size,
  at: Date.now(),
});

function fail(key, error) {
  active[key] = { error };
  emit();
  setTimeout(() => {
    if (active[key]?.error === error) {
      delete active[key];
      emit();
    }
  }, 6000);
}

// Save an episode. Tapping again while it's saving stops it.
export async function downloadEpisode(ep) {
  const key = downloadKey(ep);
  if (!key || !ep.audio || !canDownload()) return;
  if (active[key]?.abort) {
    active[key].abort.abort();
    return;
  }
  const abort = new AbortController();
  active[key] = { pct: 0, abort };
  emit();
  // Ask the browser not to clear downloads when space runs low (it decides; harmless if it says no).
  navigator.storage?.persist?.().catch(() => {});
  try {
    const res = await fetch(ep.audio, { mode: "cors", credentials: "omit", signal: abort.signal });
    if (!res.ok) throw new Error("http");
    const total = Number(res.headers.get("content-length")) || 0;
    const type = res.headers.get("content-type") || "audio/mpeg";
    const chunks = [];
    let got = 0;
    let shown = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      const pct = total ? Math.min(99, Math.floor((got / total) * 100)) : 0;
      if (pct !== shown) {
        shown = pct;
        active[key] = { pct, abort };
        emit();
      }
    }
    const blob = new Blob(chunks, { type });
    const cache = await caches.open(DL_CACHE);
    await cache.put(audioPath(key), new Response(blob, { headers: { "Content-Type": type, "Content-Length": String(blob.size) } }));
    const all = readMeta();
    all[key] = slim(ep, blob.size);
    writeMeta(all);
    delete active[key];
    emit();
  } catch (e) {
    if (e?.name === "AbortError") {
      delete active[key];
      emit();
      return;
    }
    // A blocked fetch (the host doesn't allow it) is a TypeError; a full phone is QuotaExceededError.
    fail(key, e?.name === "QuotaExceededError" ? "full" : "blocked");
  }
}

export async function removeDownload(ep) {
  const key = downloadKey(ep);
  if (!key) return;
  const all = readMeta();
  delete all[key];
  writeMeta(all);
  emit();
  try {
    const cache = await caches.open(DL_CACHE);
    await cache.delete(audioPath(key));
  } catch {}
}

// Forget downloads whose saved copy the browser has cleared (iPhone Safari clears a site's storage when it isn't
// opened for a while), so they don't show as downloaded.
export async function checkDownloads() {
  if (!canDownload()) return;
  try {
    const all = readMeta();
    const cache = await caches.open(DL_CACHE);
    let changed = false;
    for (const key of Object.keys(all)) {
      if (!(await cache.match(audioPath(key)))) {
        delete all[key];
        changed = true;
      }
    }
    if (changed) {
      writeMeta(all);
      emit();
    }
  } catch {}
}

// "48 MB"
export function sizeText(bytes) {
  if (!(bytes > 0)) return "";
  const mb = bytes / 1e6;
  return mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${Math.max(1, Math.round(mb))} MB`;
}

// ---------- what plays after a download (YY, 2026-11-25) ----------
// When a downloaded episode finishes, the next download plays, in the order My log → Downloads shows them (newest
// first), carrying on from the one that finished and wrapping round to the top. Downloads already played to the end
// since the page opened (`done`) and episodes you've logged (`skip`) are passed over. When none are left, the player
// goes on to Up next as before. public/offline.html follows the same order.

// Every download, as My log lists them.
export function downloadedList() {
  if (typeof window === "undefined") return [];
  return Object.values(readMeta()).sort((a, b) => b.at - a.at);
}

// The saved details of a downloaded episode (enough to play it with no signal), or null.
export function savedDownload(ep) {
  if (typeof window === "undefined") return null;
  const key = downloadKey(ep);
  return (key && readMeta()[key]) || null;
}

const asEpisode = (d) => ({ id: d.id ?? undefined, ref: d.ref || undefined, title: d.title, feedTitle: d.feedTitle, image: d.image, audio: d.audio, duration: d.duration });

// The download to play after `ep`, or null. `done` is a Set of download keys; `skip(ep)` says to pass one over.
export function nextDownload(ep, done, skip = () => false) {
  const key = downloadKey(ep);
  const list = downloadedList();
  const at = list.findIndex((d) => d.key === key);
  if (at < 0) return null; // only after a download
  const order = [...list.slice(at + 1), ...list.slice(0, at)];
  const d = order.find((x) => !done.has(x.key) && !skip(asEpisode(x)));
  return d ? asEpisode(d) : null;
}
