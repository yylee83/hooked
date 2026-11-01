"use client";
// Everything you save: logs, hooked shows, your list, your profile.
// Signed in → saved to your account (Supabase). Signed out → saved in this browser,
// and moved into your account the first time you sign in.
import { useSyncExternalStore } from "react";
import { supabase } from "./supabase/client";

const LOCAL = "hooked:v1";
const emptyLocal = () => ({ logs: [], shows: {}, list: [], nowPlaying: null, interests: [] });

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
  const base = { ready: true, accounts: !!db, user: null, profile: null, nowPlaying: local.nowPlaying, interests: local.interests || [] };
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
  const [l, h, li, fo, fr] = await Promise.all([
    db.from("logs").select("*").eq("user_id", user.id).order("logged_at", { ascending: false }).limit(500),
    db.from("hooked_shows").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    db.from("list_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    db.from("follows").select("followee_id, who:profiles!follows_followee_id_fkey(id, handle, display_name)").eq("follower_id", user.id),
    db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id),
  ]);
  const following = (fo.data || []).map((r) => r.who).filter((w) => w && w.handle);
  const shows = {};
  for (const s of h.data || []) shows[s.feed_id] = { feedId: s.feed_id, title: s.title, image: s.image, at: new Date(s.created_at).getTime() };
  emit({
    ...base,
    user,
    profile: p.data || { id: user.id, handle: null, display_name: null },
    // Interests live on the profile once the database has the column; until then, in this browser.
    interests: Array.isArray(p.data?.interests) && p.data.interests.length ? p.data.interests : local.interests || [],
    logs: (l.data || []).map(logFromDb),
    shows,
    list: (li.data || []).map(listFromDb),
    following,
    followerCount: fr.count || 0,
    friendsReady: !fo.error,
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

// The current state, for code that isn't a component (like the player).
export const getState = () => state;

// ---------- saving ----------
function signedIn() {
  return state?.user ? supabase() : null;
}

function updateLocal(fn) {
  const next = fn(readLocal());
  writeLocal(next);
  emit({ ...state, logs: next.logs, shows: next.shows, list: next.list, nowPlaying: next.nowPlaying, interests: next.interests || [] });
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

// Up next, in the order you added things (oldest first).
export function upNext(s) {
  return [...(s?.list || [])].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

// Topics you picked in the taste picker (keys from lib/genres.js).
export async function saveInterests(keys) {
  const local = readLocal();
  writeLocal({ ...local, interests: keys });
  emit({ ...state, interests: keys });
  const db = signedIn();
  if (db) await db.from("profiles").update({ interests: keys }).eq("id", state.user.id); // ignored if the column isn't there yet
}

export function setNowPlaying(ep) {
  const local = readLocal();
  writeLocal({ ...local, nowPlaying: ep });
  if (state) emit({ ...state, nowPlaying: ep });
  // Let people who follow you see what you're listening to.
  const db = signedIn();
  if (db && ep) {
    const slim = { id: ep.id, title: ep.title, feedId: ep.feedId, feedTitle: ep.feedTitle, image: ep.image };
    db.from("profiles").update({ now_playing: slim, now_playing_at: new Date().toISOString() }).eq("id", state.user.id).then(() => {});
  }
}

// ---------- friends ----------
export async function follow(person) {
  const db = signedIn();
  if (!db) throw new Error("Sign in to follow people.");
  if (state.following.some((f) => f.id === person.id)) return;
  emit({ ...state, following: [...state.following, person] });
  const { error } = await db.from("follows").insert({ followee_id: person.id });
  if (error && error.code !== "23505") {
    emit({ ...state, following: state.following.filter((f) => f.id !== person.id) });
    throw new Error("Couldn't follow. Try again.");
  }
}

export async function unfollow(person) {
  const db = signedIn();
  if (!db) return;
  emit({ ...state, following: state.following.filter((f) => f.id !== person.id) });
  await db.from("follows").delete().eq("follower_id", state.user.id).eq("followee_id", person.id);
}

// Send an episode (and your take on it) to friends inside the app.
export async function sendRecommendation(toIds, ep, { note = "", review = null } = {}) {
  const db = signedIn();
  if (!db) throw new Error("Sign in to send to friends.");
  if (!toIds.length) return;
  const rows = toIds.map((to_id) => ({
    to_id,
    episode_id: ep.id,
    title: ep.title,
    feed_id: ep.feedId || null,
    feed_title: ep.feedTitle || null,
    image: ep.image || ep.feedImage || null,
    audio: ep.audio || null,
    duration: ep.duration || null,
    hooked: review ? !!review.hooked : null,
    rating: review?.rating || null,
    hook: review?.hook || null,
    note: note.trim().slice(0, 280) || null,
  }));
  const { error } = await db.from("recommendations").insert(rows);
  if (error) throw new Error("Couldn't send. Try again.");
}

export async function dismissRecommendation(id) {
  const db = signedIn();
  if (!db) return;
  await db.from("recommendations").delete().eq("id", id);
}

// ---------- account ----------
export async function sendLoginLink(email, next = "/me") {
  const db = supabase();
  if (!db) throw new Error("Accounts aren't switched on yet.");
  const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
  if (error) throw new Error(friendlyAuthError(error));
}

// ---------- passwords ----------
function friendlyAuthError(error) {
  const m = (error?.message || "").toLowerCase();
  // From the invite check in Supabase (supabase/migrations/*_invite_only.sql).
  if (m.includes("invite-only")) return "Hooked is invite-only for now, and this email isn't on the list yet. If you were invited, check it's the same email.";
  if (m.includes("invalid login")) return "That email and password don't match. If you first signed up with an email link, tap “Forgot password?” to set one.";
  if (m.includes("not confirmed")) return "Confirm your email first. Check your inbox for the link we sent.";
  if (m.includes("already registered") || m.includes("already been registered")) return "There's already an account with that email. Sign in instead, or tap “Forgot password?”.";
  if (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) return "Pick a longer password: at least 8 characters.";
  if (m.includes("rate") || m.includes("seconds")) return "Too many tries. Wait a minute, then try again.";
  return error?.message || "Something went wrong. Try again.";
}

function requireDb() {
  const db = supabase();
  if (!db) throw new Error("Accounts aren't switched on yet.");
  return db;
}

export async function signInWithPassword(email, password) {
  const { error } = await requireDb().auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendlyAuthError(error));
  await load();
}

// Returns true if the account is ready now, false if the person must confirm their email first.
export async function signUpWithPassword(email, password, next = "/me") {
  if (password.length < 8) throw new Error("Pick a longer password: at least 8 characters.");
  const { data, error } = await requireDb().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) throw new Error(friendlyAuthError(error));
  // Supabase hides whether an email is taken: an existing account comes back with no identities.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error(friendlyAuthError({ message: "already registered" }));
  }
  if (data.session) {
    await load();
    return true;
  }
  return false;
}

export async function sendPasswordReset(email) {
  const { error } = await requireDb().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
  });
  if (error) throw new Error(friendlyAuthError(error));
}

export async function setPassword(password) {
  if (password.length < 8) throw new Error("Pick a longer password: at least 8 characters.");
  const { error } = await requireDb().auth.updateUser({ password });
  if (error) throw new Error(friendlyAuthError(error));
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
