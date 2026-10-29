"use client";
// Everything you save: logs, hooked shows, your list, your profile.
// Signed in → saved to your account (Supabase). Signed out → saved in this browser,
// and moved into your account the first time you sign in.
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase/client";

const LOCAL = "hooked:v1";
const emptyLocal = () => ({ logs: [], shows: {}, list: [], nowPlaying: null });

let state = null; // null until loaded in the browser
let started = false;
const listeners = new Set();

function emit(next) {
  state = next;
  listeners.forEach((l) => l());
}

function readLocal() {
  try {
    const raw = window.localStorage.getItem(LOCAL);
    return raw ? { ...emptyLocal(), ...JSON.parse(raw) } : emptyLocal();
  } catch {
    return emptyLocal();
  }
}

function writeLocal(data) {
  try {
    window.localStorage.setItem(LOCAL, JSON.stringify(data));
  } catch {}
}

// ---------- mapping between the database and the app ----------
const logFromDb = (r) => ({
  id: Number(r.episode_id),
  title: r.title,
  feedId: r.feed_id,
  feedTitle: r.feed_title || "",
  image: r.image,
  feedImage: r.feed_image,
  audio: r.audio,
  duration: r.duration,
  hooked: r.hooked,
  rating: Number(r.rating) || 0,
  hook: r.hook || "",
  sentTo: r.sent_to || [],
  loggedAt: new Date(r.logged_at).getTime(),
});
const logToDb = (l) => ({
  episode_id: l.id,
  title: l.title,
  feed_id: l.feedId || null,
  feed_title: l.feedTitle || null,
  image: l.image || null,
  feed_image: l.feedImage || null,
  audio: l.audio || null,
  duration: l.duration || null,
  hooked: !!l.hooked,
  rating: l.rating || null,
  hook: l.hook || null,
  sent_to: l.sentTo || [],
  ...(l.loggedAt ? { logged_at: new Date(l.loggedAt).toISOString() } : {}),
});
const listKey = (i) => String(i.episodeId || i.title);
const listToDb = (i) => ({
  item_key: listKey(i),
  episode_id: i.episodeId || null,
  title: i.title,
  feed_id: i.feedId || null,
  feed_title: i.feedTitle || null,
  image: i.image || null,
  from_who: i.from || null,
});
const listFromDb = (r) => ({
  episodeId: r.episode_id ? Number(r.episode_id) : undefined,
  title: r.title,
  feedId: r.feed_id,
  feedTitle: r.feed_title,
  image: r.image,
  from: r.from_who,
  addedAt: new Date(r.created_at).getTime(),
});

// ---------- loading ----------
async function load() {
  const local = readLocal();
  const db = supabase();
  const base = { ready: true, accounts: !!db, user: null, profile: null, nowPlaying: local.nowPlaying };
  if (!db) return emit({ ...base, logs: local.logs, shows: local.shows, list: local.list });

  const { data } = await db.auth.getSession();
  const user = data.session?.user || null;
  if (!user) return emit({ ...base, logs: local.logs, shows: local.shows, list: local.list });

  // Make sure this person has a profile row (first sign-in).
  let prof = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!prof.data && !prof.error) {
    await db.from("profiles").insert({ id: user.id });
    prof = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  }

  // First sign-in on this browser: move anything saved here into the account.
  if (local.logs.length || Object.keys(local.shows).length || local.list.length) {
    const jobs = [];
    if (local.logs.length) jobs.push(db.from("logs").upsert(local.logs.map(logToDb), { onConflict: "user_id,episode_id" }));
    const shows = Object.values(local.shows);
    if (shows.length)
      jobs.push(db.from("hooked_shows").upsert(shows.map((s) => ({ feed_id: s.feedId, title: s.title, image: s.image })), { onConflict: "user_id,feed_id" }));
    if (local.list.length) jobs.push(db.from("list_items").upsert(local.list.map(listToDb), { onConflict: "user_id,item_key" }));
    const results = await Promise.all(jobs);
    if (results.every((r) => !r.error)) writeLocal({ ...emptyLocal(), nowPlaying: local.nowPlaying });
  }

  const p = prof;
  const [l, h, li] = await Promise.all([
    db.from("logs").select("*").eq("user_id", user.id).order("logged_at", { ascending: false }).limit(500),
    db.from("hooked_shows").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    db.from("list_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);
  const shows = {};
  for (const s of h.data || []) shows[s.feed_id] = { feedId: s.feed_id, title: s.title, image: s.image, at: new Date(s.created_at).getTime() };
  emit({
    ...base,
    user,
    profile: p.data || { id: user.id, handle: null, display_name: null },
    logs: (l.data || []).map(logFromDb),
    shows,
    list: (li.data || []).map(listFromDb),
    error: p.error || l.error ? "Couldn't load your account. Check the database setup." : null,
  });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  load();
  const db = supabase();
  if (db) db.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") load();
  });
  window.addEventListener("storage", (e) => e.key === LOCAL && load());
}

function subscribe(cb) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useStore() {
  return useSyncExternalStore(subscribe, () => state, () => null);
}

// ---------- saving ----------
function signedIn() {
  return state?.user ? supabase() : null;
}

function updateLocal(fn) {
  const next = fn(readLocal());
  writeLocal(next);
  emit({ ...state, logs: next.logs, shows: next.shows, list: next.list, nowPlaying: next.nowPlaying });
}

export async function addLog(entry) {
  const log = { ...entry, loggedAt: Date.now() };
  const db = signedIn();
  if (!db) return updateLocal((s) => ({ ...s, logs: [log, ...s.logs.filter((l) => l.id !== log.id)] }));
  emit({ ...state, logs: [log, ...state.logs.filter((l) => l.id !== log.id)] });
  const { error } = await db.from("logs").upsert(logToDb(log), { onConflict: "user_id,episode_id" });
  if (error) throw error;
}

export async function deleteLog(id) {
  const db = signedIn();
  if (!db) return updateLocal((s) => ({ ...s, logs: s.logs.filter((l) => l.id !== id) }));
  emit({ ...state, logs: state.logs.filter((l) => l.id !== id) });
  await db.from("logs").delete().eq("user_id", state.user.id).eq("episode_id", id);
}

export async function toggleHookedShow(show) {
  const db = signedIn();
  const on = !!state?.shows[show.feedId];
  if (!db) {
    return updateLocal((s) => {
      const shows = { ...s.shows };
      if (on) delete shows[show.feedId];
      else shows[show.feedId] = { ...show, at: Date.now() };
      return { ...s, shows };
    });
  }
  const shows = { ...state.shows };
  if (on) delete shows[show.feedId];
  else shows[show.feedId] = { ...show, at: Date.now() };
  emit({ ...state, shows });
  if (on) await db.from("hooked_shows").delete().eq("user_id", state.user.id).eq("feed_id", show.feedId);
  else await db.from("hooked_shows").upsert({ feed_id: show.feedId, title: show.title, image: show.image }, { onConflict: "user_id,feed_id" });
}

export async function addToList(item) {
  const db = signedIn();
  const key = listKey(item);
  const entry = { ...item, addedAt: Date.now() };
  if (!db) {
    return updateLocal((s) => (s.list.some((i) => listKey(i) === key) ? s : { ...s, list: [entry, ...s.list] }));
  }
  if (state.list.some((i) => listKey(i) === key)) return;
  emit({ ...state, list: [entry, ...state.list] });
  await db.from("list_items").upsert(listToDb(item), { onConflict: "user_id,item_key" });
}

export async function removeFromList(item) {
  const db = signedIn();
  const key = listKey(item);
  if (!db) return updateLocal((s) => ({ ...s, list: s.list.filter((i) => listKey(i) !== key) }));
  emit({ ...state, list: state.list.filter((i) => listKey(i) !== key) });
  await db.from("list_items").delete().eq("user_id", state.user.id).eq("item_key", key);
}

export function setNowPlaying(ep) {
  const local = readLocal();
  writeLocal({ ...local, nowPlaying: ep });
  if (state) emit({ ...state, nowPlaying: ep });
}

// ---------- account ----------
export async function sendLoginLink(email, next = "/me") {
  const db = supabase();
  if (!db) throw new Error("Accounts aren't switched on yet.");
  const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
  if (error) throw error;
}

export async function saveProfile({ handle, displayName }) {
  const db = signedIn();
  if (!db) throw new Error("Sign in first.");
  const clean = handle.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9._]{2,24}$/.test(clean)) throw new Error("Handles are 2–24 characters: letters, numbers, dots and underscores.");
  // Upsert: works even if the profile row wasn't created yet.
  const { data, error } = await db
    .from("profiles")
    .upsert({ id: state.user.id, handle: clean, display_name: displayName?.trim() || null }, { onConflict: "id" })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.code === "23505" ? "That handle is taken. Try another." : `Couldn't save: ${error.message}`);
  if (!data) throw new Error("Couldn't save your profile. The database setup may need to be run again.");
  emit({ ...state, profile: data });
}

export async function signOut() {
  const db = supabase();
  if (db) await db.auth.signOut();
  await load();
}

export function initialsOf(profile, fallback = "me") {
  const name = profile?.display_name || profile?.handle;
  if (!name) return fallback;
  const parts = name.replace(/[._]/g, " ").trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

// Shows you're hooked on: ones you marked on a show page, plus ones you logged as hooked.
export function hookedShows(s) {
  if (!s) return [];
  const map = new Map();
  for (const x of Object.values(s.shows).sort((a, b) => (b.at || 0) - (a.at || 0))) map.set(String(x.feedId), x);
  for (const l of s.logs) {
    if (l.hooked && l.feedId && !map.has(String(l.feedId))) {
      map.set(String(l.feedId), { feedId: l.feedId, title: l.feedTitle, image: l.feedImage || l.image });
    }
  }
  return [...map.values()];
}
