"use client";
// Your log, saved in this browser for now. (Accounts + a shared database come later.)
import { useEffect, useState } from "react";

const KEY = "hooked:v1";
const EVENT = "hooked-store";
const empty = () => ({ logs: [], shows: {}, list: [], nowPlaying: null });

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

function write(next) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function update(fn) {
  const next = fn(read());
  write(next);
  return next;
}

export function useStore() {
  const [state, setState] = useState(null); // null until loaded in the browser
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return state;
}

export function addLog(entry) {
  update((s) => ({
    ...s,
    logs: [{ ...entry, loggedAt: Date.now() }, ...s.logs.filter((l) => l.id !== entry.id)],
  }));
}

export function toggleHookedShow(show) {
  update((s) => {
    const shows = { ...s.shows };
    if (shows[show.feedId]) delete shows[show.feedId];
    else shows[show.feedId] = { ...show, at: Date.now() };
    return { ...s, shows };
  });
}

export function addToList(item) {
  update((s) => {
    const key = item.episodeId || item.title;
    if (s.list.some((i) => (i.episodeId || i.title) === key)) return s;
    return { ...s, list: [{ ...item, addedAt: Date.now() }, ...s.list] };
  });
}

export function removeFromList(item) {
  const key = item.episodeId || item.title;
  update((s) => ({ ...s, list: s.list.filter((i) => (i.episodeId || i.title) !== key) }));
}

export function setNowPlaying(ep) {
  update((s) => ({ ...s, nowPlaying: ep }));
}

// Shows you're hooked on: ones you marked on a show page, plus ones you logged as hooked.
export function hookedShows(state) {
  if (!state) return [];
  const map = new Map();
  for (const s of Object.values(state.shows).sort((a, b) => b.at - a.at)) map.set(String(s.feedId), s);
  for (const l of state.logs) {
    if (l.hooked && !map.has(String(l.feedId))) {
      map.set(String(l.feedId), { feedId: l.feedId, title: l.feedTitle, image: l.feedImage || l.image });
    }
  }
  return [...map.values()];
}
