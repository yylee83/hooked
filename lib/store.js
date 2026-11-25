"use client";
// Everything you save: logs, hooked shows, your list, your profile.
// Saved to your account (Supabase). Logs, Up next and hooked shows need an account (lib/sign-in-first.js): signed
// out, they aren't saved. Anything saved in this browser before that (or with no database, in local development)
// is moved into your account the first time you sign in.
import { useSyncExternalStore } from "react";
import { ensureRefs, refreshCatalog } from "./catalog-client";
import { supabase } from "./supabase/client";
import { pingNotifyEmails } from "./notify-ping";
import { checkCleanName, checkCleanWords, cleanWordsMessage } from "./clean-words";
import { HOOKED_SHOW, LOG_EPISODE, episodeOf, withEpisode, withShow } from "./log-episode";

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
// `ref`, `episodeRef` and `showRef` are our short ids (filled in by the database), used for links.
const logFromDb = (row) => logShape(withEpisode(row)); // episode details from our tables
const logShape = (r) => ({
  id: r.episode_id != null ? Number(r.episode_id) : undefined,
  ref: r.episode_ref || undefined,
  title: r.title,
  feedId: r.feed_id,
  showRef: r.show_ref || undefined, // our show id, through the log's episode
  feedTitle: r.feed_title || "",
  image: r.image,
  feedImage: r.feed_image,
  audio: r.audio,
  duration: r.duration,
  rating: Number(r.rating) || 0,
  hook: r.hook || "",
  sentTo: r.sent_to || [],
  loggedAt: new Date(r.logged_at).getTime(),
});
// Saved by our episode id only: the episode's title, cover, audio and show live in our episodes and
// shows (stage D). A save without our id is refused by the database.
const logToDb = (l) => ({
  episode_ref: l.ref,
  // Hooked is for shows now (Decision 6). Only logs saved on this device before that still carry an answer.
  ...(typeof l.hooked === "boolean" ? { hooked: l.hooked } : {}),
  rating: l.rating || null,
  hook: l.hook || null,
  sent_to: l.sentTo || [],
  ...(l.loggedAt ? { logged_at: new Date(l.loggedAt).toISOString() } : {}),
});
// Up next items are keyed by our episode id (older ones by the Podcast Index number, or the title).
const listKey = (i) => String(i.key || i.episodeRef || i.episodeId || i.title);
const listToDb = (i) => ({
  item_key: listKey(i),
  episode_ref: i.episodeRef,
  ...(i.showRef ? { show_ref: i.showRef } : {}),
  from_who: i.from || null,
});
const listFromDb = (row) => listShape(withEpisode(row)); // episode details from our tables
const listShape = (r) => ({
  key: r.item_key,
  episodeId: r.episode_id ? Number(r.episode_id) : undefined,
  episodeRef: r.episode_ref || undefined,
  showRef: r.show_ref || undefined,
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
  const base = { ready: true, accounts: !!db, user: null, profile: null, nowPlaying: local.nowPlaying, interests: local.interests || [], blocked: [] };
  if (!db) return emit({ ...base, logs: local.logs, shows: local.shows, list: local.list });

  const { data } = await db.auth.getSession();
  const user = data.session?.user || null;
  if (!user) return emit({ ...base, logs: local.logs, shows: local.shows, list: local.list });

  // Make sure this person has a profile row (first sign-in).
  let prof = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!prof.data && !prof.error) {
    await db.from("profiles").insert({ id: user.id });
    prof = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
    // Joined through an invite link: the database just made them follow whoever sent it, so email that person now.
    if (user.user_metadata?.invite) pingNotifyEmails();
  }
  // The handle chosen on the sign-up form. If someone took it meanwhile, My log asks for another.
  // The name is optional, and only filled in if the profile doesn't have one yet.
  const chosen = user.user_metadata?.handle;
  const chosenName = user.user_metadata?.display_name;
  if (prof.data && !prof.data.handle && chosen) {
    const fill = { handle: chosen, ...(chosenName && !prof.data.display_name ? { display_name: chosenName } : {}) };
    const saved = await db.from("profiles").update(fill).eq("id", user.id).select().maybeSingle();
    if (saved.data) prof = saved;
  }

  // First sign-in on this browser: move anything saved here into the account.
  if (local.logs.length || Object.keys(local.shows).length || local.list.length) {
    // Logs saved here before Decision 6 that said "hooked" hook their show, as the database catch-up did for accounts.
    for (const l of local.logs) {
      const show = { showRef: l.showRef, feedId: l.feedId, title: l.feedTitle, image: l.feedImage || l.image, at: l.loggedAt };
      if (l.hooked === true && (show.showRef || show.feedId != null) && !Object.values(local.shows).some((x) => sameShow(x, show))) local.shows[showKey(show)] = show;
    }
    // Things saved before we knew our id for them get it from the server first.
    const m = await ensureRefs({
      episodeIds: [...local.logs.filter((l) => !l.ref).map((l) => l.id), ...local.list.filter((i) => !i.episodeRef).map((i) => i.episodeId)],
      feedIds: Object.values(local.shows).filter((x) => !x.showRef).map((x) => x.feedId),
    });
    local.logs = local.logs.map((l) => (!l.ref && m.episodes[l.id] ? { ...l, ref: m.episodes[l.id] } : l));
    local.list = local.list.map((i) => (!i.episodeRef && m.episodes[i.episodeId] ? { ...i, episodeRef: m.episodes[i.episodeId] } : i));
    local.shows = Object.fromEntries(Object.entries(local.shows).map(([k, x]) => [k, !x.showRef && m.shows[x.feedId] ? { ...x, showRef: m.shows[x.feedId] } : x]));
    // Only what has our id can be saved; anything else stays on this browser and is tried again next time.
    const keep = { logs: local.logs.filter((l) => !l.ref), list: local.list.filter((i) => !i.episodeRef), shows: Object.fromEntries(Object.entries(local.shows).filter(([, x]) => !x.showRef)) };
    local.logs = local.logs.filter((l) => l.ref);
    local.list = local.list.filter((i) => i.episodeRef);
    local.shows = Object.fromEntries(Object.entries(local.shows).filter(([, x]) => x.showRef));
    const jobs = [];
    if (local.logs.length) jobs.push(db.from("logs").upsert(local.logs.map(logToDb), { onConflict: "user_id,episode_ref" }));
    const shows = Object.values(local.shows);
    if (shows.length)
      // One at a time, so a show already hooked on the account doesn't stop the rest.
      jobs.push(Promise.all(shows.map((x) => db.from("hooked_shows").insert(hookedToDb(x)))).then((rs) => ({ error: rs.find((r) => r.error && r.error.code !== "23505")?.error })));
    if (local.list.length) jobs.push(db.from("list_items").upsert(local.list.map(listToDb), { onConflict: "user_id,item_key" }));
    const results = await Promise.all(jobs);
    if (results.every((r) => !r.error)) writeLocal({ ...emptyLocal(), ...keep, nowPlaying: local.nowPlaying });
  }

  const p = prof;
  const [l, h, li, fo, fr, bl] = await Promise.all([
    db.from("logs").select(`episode_ref, rating, hook, sent_to, logged_at, ${LOG_EPISODE}`).eq("user_id", user.id).order("logged_at", { ascending: false }).limit(500),
    db.from("hooked_shows").select(`show_ref, created_at, ${HOOKED_SHOW}`).eq("user_id", user.id).order("created_at", { ascending: false }),
    db.from("list_items").select(`item_key, episode_ref, show_ref, from_who, created_at, ${episodeOf("list_items")}`).eq("user_id", user.id).order("created_at", { ascending: false }),
    db.from("follows").select("followee_id, who:profiles!follows_followee_id_fkey(id, handle, display_name)").eq("follower_id", user.id),
    db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id),
    // People you blocked: their reviews and replies are hidden from you. (Empty until the database has blocks.)
    db.from("blocks").select("blocked_id").eq("blocker_id", user.id),
  ]);
  const following = (fo.data || []).map((r) => r.who).filter((w) => w && w.handle);
  const shows = {};
  for (const s of (h.data || []).map(withShow)) { // show name and cover from our tables
    const x = { feedId: s.feed_id ?? undefined, showRef: s.show_ref || undefined, title: s.title, image: s.image, at: new Date(s.created_at).getTime() };
    shows[showKey(x)] = x;
  }
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
    blocked: (bl.data || []).map((b) => b.blocked_id),
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

// Load the account again (Home's refresh: Up next, who you follow). Returns when it's done.
export function reloadStore() {
  if (!started) return Promise.resolve();
  return load().catch(() => {});
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
/** Accounts exist but you're not signed in: logs, Up next and hooked shows can't be saved. */
export const needsAccount = (s) => !!s?.accounts && !s.user;

function signedIn() {
  return state?.user ? supabase() : null;
}

function updateLocal(fn) {
  const next = fn(readLocal());
  writeLocal(next);
  emit({ ...state, logs: next.logs, shows: next.shows, list: next.list, nowPlaying: next.nowPlaying, interests: next.interests || [] });
}

// Is this the same episode? Both sides are { ref, id }: our short id and the Podcast Index number.
// Compares short ids when both have one, otherwise the numbers.
export function sameEpisode(a, b) {
  if (!a || !b) return false;
  if (a.ref && b.ref) return a.ref === b.ref;
  return a.id != null && b.id != null && String(a.id) === String(b.id);
}
const itemEpisode = (i) => ({ ref: i.episodeRef, id: i.episodeId });

// Our id for an episode or show we only know by its Podcast Index number. The server finds or creates
// the entry (from Podcast Index). Null if it can't; the database then fills the id in itself (until stage D).
const ourEpisodeId = async (id) => (id != null ? (await ensureRefs({ episodeIds: [id] })).episodes[id] || null : null);
const ourShowId = async (feedId) => (feedId != null ? (await ensureRefs({ feedIds: [feedId] })).shows[feedId] || null : null);

/** Your log of an episode (a card with ref/id), if you have one. */
export const findLog = (s, ep) => s?.logs?.find((l) => sameEpisode(l, ep));
/** Is this episode in your Up next? */
export const inUpNext = (s, ep) => !!s?.list?.some((i) => i.episodeRef || i.episodeId ? sameEpisode(itemEpisode(i), ep) : false);

export async function addLog(entry) {
  if (needsAccount(state)) throw new Error("Sign in to log episodes");
  const log = { ...entry, loggedAt: Date.now() };
  const db = signedIn();
  if (!db) {
    await checkCleanWords(log.hook, `${log.title || ""} / ${log.feedTitle || ""}`);
    return updateLocal((s) => ({ ...s, logs: [log, ...s.logs.filter((l) => !sameEpisode(l, log))] }));
  }
  // Shown as yours straight away; taken back if the save fails (with any earlier log of it put back).
  const before = state.logs.find((l) => sameEpisode(l, log));
  emit({ ...state, logs: [log, ...state.logs.filter((l) => !sameEpisode(l, log))] });
  let data, error;
  try {
    // Save with our episode id; if we only know the Podcast Index number, the server gives us ours first.
    const ref = log.ref || (await ourEpisodeId(log.id));
    ({ data, error } = await db.from("logs").upsert(logToDb(ref ? { ...log, ref } : log), { onConflict: "user_id,episode_ref" }).select("episode_ref").single());
  } catch (e) {
    error = e;
  }
  if (error) {
    emit({ ...state, logs: [...(before ? [before] : []), ...state.logs.filter((l) => l !== log)] });
    const clean = cleanWordsMessage(error);
    throw clean ? Object.assign(new Error(clean), { code: error.code }) : error;
  }
  // Saved: keep it shown under our id, even if your account reloaded meanwhile (from before the save).
  const saved = data?.episode_ref && data.episode_ref !== log.ref ? { ...log, ref: data.episode_ref } : log;
  emit({ ...state, logs: [saved, ...state.logs.filter((l) => l !== log && !sameEpisode(l, saved))] });
  if (log.id) refreshCatalog({ episodeId: log.id });
}

export async function deleteLog(log) {
  const db = signedIn();
  if (!db) return updateLocal((s) => ({ ...s, logs: s.logs.filter((l) => !sameEpisode(l, log)) }));
  emit({ ...state, logs: state.logs.filter((l) => !sameEpisode(l, log)) });
  const ref = log.ref || findLog(state, log)?.ref; // saved logs always have our id
  if (ref) await db.from("logs").delete().eq("user_id", state.user.id).eq("episode_ref", ref);
}

// ---------- shows ----------
// A show is { showRef, feedId }: our short id, and the Podcast Index number when it has one.
// Hooked shows are stored by our id (older ones, saved on this device, by the number).
export const showKey = (x) => String(x?.showRef || x?.feedId || "");
export function sameShow(a, b) {
  if (!a || !b) return false;
  if (a.showRef && b.showRef) return a.showRef === b.showRef;
  return a.feedId != null && b.feedId != null && String(a.feedId) === String(b.feedId);
}
/** Your hooked entry for a show, if you're hooked on it. */
export const findHookedShow = (s, show) => Object.values(s?.shows || {}).find((x) => sameShow(x, show));
const hookedToDb = (x) => ({ show_ref: x.showRef });

export async function toggleHookedShow(show) {
  if (needsAccount(state)) return;
  const db = signedIn();
  const had = findHookedShow(state, show);
  const next = (shows) => {
    const out = Object.fromEntries(Object.entries(shows).filter(([, x]) => !sameShow(x, show)));
    if (!had) out[showKey(show)] = { ...show, at: Date.now() };
    return out;
  };
  if (!db) return updateLocal((s) => ({ ...s, shows: next(s.shows) }));
  const before = state.shows;
  emit({ ...state, shows: next(state.shows) });
  if (had) {
    const showRef = had.showRef || show.showRef; // saved hooked shows always have our id
    if (showRef) await db.from("hooked_shows").delete().eq("user_id", state.user.id).eq("show_ref", showRef);
  } else {
    // Save with our show id (the server gives us ours if we only know the Podcast Index number).
    const showRef = show.showRef || (await ourShowId(show.feedId));
    if (showRef && !show.showRef) emit({ ...state, shows: Object.fromEntries(Object.entries(state.shows).map(([k, x]) => [k, sameShow(x, show) ? { ...x, showRef } : x])) });
    // Already hooked from another device: nothing to do.
    const { error } = showRef ? await db.from("hooked_shows").insert(hookedToDb({ ...show, showRef })) : { error: new Error("no show id") };
    if (error && error.code !== "23505") return emit({ ...state, shows: before }); // didn't save: undo on screen
    if (show.feedId) refreshCatalog({ feedId: show.feedId });
  }
}

// `first`: put it at the top of Up next, so it plays next (Search's "In the news, explained" → Play all).
export async function addToList(item, { first = false } = {}) {
  if (needsAccount(state)) return;
  const db = signedIn();
  const key = listKey(item);
  const top = Math.min(Date.now(), ...(state?.list || []).map((i) => i.addedAt || Date.now()));
  const entry = { ...item, addedAt: first ? top - 1000 : Date.now() };
  const has = (list) => list.some((i) => listKey(i) === key || sameListItem(i, item));
  if (!db) return updateLocal((s) => (has(s.list) ? s : { ...s, list: [entry, ...s.list] }));
  if (has(state.list)) return;
  emit({ ...state, list: [entry, ...state.list] });
  // Save with our episode id, so the item's key is our id too (the server gives it to us if needed).
  const episodeRef = item.episodeRef || (await ourEpisodeId(item.episodeId));
  const saved = episodeRef && !item.episodeRef ? { ...entry, episodeRef } : entry;
  if (saved !== entry) emit({ ...state, list: state.list.map((i) => (i === entry ? saved : i)) });
  await db.from("list_items").upsert({ ...listToDb(saved), ...(first ? { created_at: new Date(saved.addedAt).toISOString() } : {}) }, { onConflict: "user_id,item_key" });
  if (item.episodeId || item.feedId) refreshCatalog(item.episodeId ? { episodeId: item.episodeId } : { feedId: item.feedId });
}

// The same Up next entry: same key, or the same episode saved under an older key.
function sameListItem(a, b) {
  if (listKey(a) === listKey(b)) return true;
  return (a.episodeRef || a.episodeId) && (b.episodeRef || b.episodeId) ? sameEpisode(itemEpisode(a), itemEpisode(b)) : false;
}

export async function removeFromList(item) {
  const db = signedIn();
  if (!db) return updateLocal((s) => ({ ...s, list: s.list.filter((i) => !sameListItem(i, item)) }));
  // Remove by the key each saved row actually has (older rows may use the Podcast Index number).
  const keys = [...new Set(state.list.filter((i) => sameListItem(i, item)).map(listKey).concat(listKey(item)))];
  emit({ ...state, list: state.list.filter((i) => !sameListItem(i, item)) });
  await db.from("list_items").delete().eq("user_id", state.user.id).in("item_key", keys);
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
    const slim = { id: ep.id, ref: ep.ref, title: ep.title, feedId: ep.feedId, feedTitle: ep.feedTitle, image: ep.image };
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
    throw new Error(error.code === "HKB01" ? "You can't follow this person." : "Couldn't follow. Try again.");
  }
  if (!error) pingNotifyEmails();
}

export async function unfollow(person) {
  const db = signedIn();
  if (!db) return;
  emit({ ...state, following: state.following.filter((f) => f.id !== person.id) });
  await db.from("follows").delete().eq("follower_id", state.user.id).eq("followee_id", person.id);
}

// Block someone: you stop following each other, they can't follow, reply to or send you anything, and their reviews
// and replies are hidden from you. Nobody is told. (The database does the clearing: 20261124200000_reports_blocks.sql.)
export function isBlocked(s, id) {
  return !!id && !!s?.blocked?.includes(id);
}

export async function block(person) {
  const db = signedIn();
  if (!db) throw new Error("Sign in first.");
  if (isBlocked(state, person.id)) return;
  const before = state;
  emit({ ...state, blocked: [...(state.blocked || []), person.id], following: state.following.filter((f) => f.id !== person.id) });
  const { error } = await db.from("blocks").insert({ blocked_id: person.id });
  if (error && error.code !== "23505") {
    emit({ ...state, blocked: before.blocked, following: before.following });
    throw new Error("Couldn't block. Try again.");
  }
  db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", state.user.id)
    .then(({ count }) => count != null && emit({ ...state, followerCount: count }));
}

export async function unblock(person) {
  const db = signedIn();
  if (!db) return;
  emit({ ...state, blocked: (state.blocked || []).filter((id) => id !== person.id) });
  const { error } = await db.from("blocks").delete().eq("blocker_id", state.user.id).eq("blocked_id", person.id);
  if (error) {
    emit({ ...state, blocked: [...(state.blocked || []), person.id] });
    throw new Error("Couldn't unblock. Try again.");
  }
}

// Send an episode (and your take on it) to friends inside the app.
export async function sendRecommendation(toIds, ep, { note = "", review = null } = {}) {
  const db = signedIn();
  if (!db) throw new Error("Sign in to send to friends.");
  if (!toIds.length) return;
  const ref = ep.ref || (await ourEpisodeId(ep.id));
  const rows = toIds.map((to_id) => ({
    to_id,
    episode_ref: ref,
    rating: review?.rating || null,
    hook: review?.hook || null,
    note: note.trim().slice(0, 280) || null,
  }));
  const { error } = await db.from("recommendations").insert(rows);
  if (error) throw new Error(cleanWordsMessage(error) || (error.code === "HKB01" ? "You can't send to one of these people." : "Couldn't send. Try again."));
  pingNotifyEmails();
  if (ep.id) refreshCatalog({ episodeId: ep.id });
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

// The 6-digit code in sign-in, confirm and reset emails (supabase/templates/). Typing it works on any device, even
// when the link in the email has expired or was opened by a mail scanner. kind: what we emailed ("link" | "confirm" | "reset").
export async function verifyEmailCode(email, code, kind = "link") {
  const token = String(code || "").replace(/\D/g, "");
  if (token.length < 6) throw new Error("Type the code from the email: it's 6 numbers or more.");
  const db = requireDb();
  const { error } = await db.auth.verifyOtp({ email, token, type: kind === "reset" ? "recovery" : "email" });
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("expired") || m.includes("invalid")) throw new Error("That code didn't work. It may have expired: send a new email and use the newest code.");
    throw new Error(friendlyAuthError(error));
  }
  await load();
}

// Send the sign-up confirmation email again (an account made but not confirmed yet).
export async function resendConfirmation(email, next = "/welcome/shows") {
  const { error } = await requireDb().auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) throw new Error(friendlyAuthError(error));
}

// ---------- passwords ----------
function friendlyAuthError(error) {
  const m = (error?.message || "").toLowerCase();
  // From the invite check in Supabase (supabase/migrations/*_invite_only.sql).
  if (m.includes("invite-only")) return "Hooked is invite-only for now, and this email isn't on the list yet. If you were invited, check it's the same email.";
  if (m.includes("invalid login")) return "That email and password don't match. If you first signed up with an email link, tap “Forgot password?” to set one.";
  if (m.includes("not confirmed")) return "Confirm your email first. Check your inbox (and spam) for the email we sent.";
  if (m.includes("already registered") || m.includes("already been registered")) return "There's already an account with that email. Sign in instead, or tap “Forgot password?”.";
  if (m.includes("password") && (m.includes("6") || m.includes("short") || m.includes("weak"))) return "Pick a longer password: at least 8 characters.";
  if (m.includes("seconds")) return "We just sent one. Give it a minute (and check spam) before asking again.";
  if (m.includes("rate")) return "Too many emails in a short time. Wait a few minutes, check spam, then try again.";
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
// Handles: 2–24 characters, lower case letters, numbers, dots and underscores.
export function cleanHandle(handle) {
  const clean = (handle || "").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9._]{2,24}$/.test(clean)) throw new Error("Handles are 2–24 characters: letters, numbers, dots and underscores.");
  return clean;
}

// New accounts choose a handle on the sign-up form (YY, 2026-11-22). It rides along with the account and is saved
// to the profile on the first sign-in (see load()), which may come later, after the email is confirmed.
export async function signUpWithPassword(email, password, next = "/me", handle = "", name = "", invite = "") {
  if (password.length < 8) throw new Error("Pick a longer password: at least 8 characters.");
  const wanted = cleanHandle(handle);
  const db = requireDb();
  const { data: taken } = await db.from("profiles").select("id").eq("handle", wanted).maybeSingle();
  if (taken) throw new Error("That handle is taken. Try another.");
  await checkCleanName(wanted);
  await checkCleanName(name);
  const { data, error } = await db.auth.signUp({
    email,
    password,
    // Kept with the account until the profile is made on first sign-in (load()). over_13: the form's required tick box.
    // invite: an invite link's code; Supabase Auth's hook_invite_gate lets the sign-up in with it.
    options: { data: { handle: wanted, display_name: name.trim().slice(0, 60) || undefined, over_13: true, invite: invite || undefined }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
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

// Ask to join while Hooked is invite-only. Says nothing back about whether the email is already invited.
export async function joinWaitlist(email) {
  const { error } = await requireDb().rpc("join_waitlist", { p_email: email });
  if (error) throw new Error("Couldn't add you just now. Try again in a minute.");
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
  const clean = cleanHandle(handle);
  // Upsert: works even if the profile row wasn't created yet.
  const { data, error } = await db
    .from("profiles")
    .upsert({ id: state.user.id, handle: clean, display_name: displayName?.trim() || null }, { onConflict: "id" })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.code === "23505" ? "That handle is taken. Try another." : cleanWordsMessage(error) || `Couldn't save: ${error.message}`);
  if (!data) throw new Error("Couldn't save your profile. The database setup may need to be run again.");
  emit({ ...state, profile: data });
}

// The short, skippable questions right after sign-up (app/welcome/about). Private to you and the Hooked team.
export async function saveSignupAnswers({ heardFrom, heardOther, place, country }) {
  const db = signedIn();
  if (!db) return;
  const row = {
    user_id: state.user.id,
    over_13: state.user.user_metadata?.over_13 === true ? true : null,
    heard_from: heardFrom || null,
    heard_other: heardFrom === "other" ? heardOther?.trim().slice(0, 120) || null : null,
    place: place?.trim().slice(0, 80) || null,
    country: /^[A-Z]{2}$/.test(country || "") ? country : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("signup_answers").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error("Couldn't save that. Try again, or skip.");
}

// The few accounts that got a handle picked for them (handle_auto) see a one-time note; keeping or changing it ends it.
export async function settleHandle() {
  const db = signedIn();
  if (!db || !state.profile?.handle_auto) return;
  emit({ ...state, profile: { ...state.profile, handle_auto: false } });
  await db.from("profiles").update({ handle_auto: false }).eq("id", state.user.id);
}

export async function signOut() {
  // Home's remembered "New episodes" row (components/NewEpisodes.js) was this account's: don't show it to the next person.
  try {
    window.localStorage.removeItem("hooked:new-eps");
  } catch {}
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

// Shows you're hooked on, newest first: only ones you chose (show page, or the pill on the log sheet). Logging or rating
// an episode never hooks its show (Decision 6); the one-time catch-up turned earlier "hooked" logs into hooked shows.
export function hookedShows(s) {
  if (!s) return [];
  return Object.values(s.shows).sort((a, b) => (b.at || 0) - (a.at || 0));
}
