"use client";
// Replies and reactions on logs, and your notifications.
// Threads load in batches: every thread on a page is fetched with two queries total.
import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

// Each reaction records a different signal:
//   agree / disagree → thumbs up / down on the review (you can pick one, not both)
//   adding   → this review made them want to listen (also adds it to their Up next).
//              If they later log the episode, the review "got them to listen".
export const REACTIONS = [
  { kind: "agree", label: "Agree", cls: "react--agree" },
  { kind: "disagree", label: "Disagree", cls: "react--disagree" },
  { kind: "adding", label: "Add to queue", cls: "react--list" },
];
export const REACTION_WORDS = { agree: "thumbs up", disagree: "thumbs down", adding: "adding it", great: "thumbs up", same: "thumbs up", ooh: "thumbs up" };
// Older reactions, from before the change (until the database update converts them).
const LEGACY = { same: "agree", ooh: "agree", great: "agree" };
const OPPOSITE = { agree: "disagree", disagree: "agree" };

// How valuable a review is, from what people did with it. Used to order reviews.
export function reviewScore({ reactions = [], comments = [], hook = "" } = {}) {
  const n = (k) => reactions.filter((r) => (LEGACY[r.kind] || r.kind) === k).length;
  // "Adding it" (made someone want to listen) counts most, then thumbs up, then replies.
  return n("adding") * 3 + n("agree") * 2 + n("disagree") + comments.length * 1.5 + (hook ? Math.min(2, hook.length / 80) : 0);
}

const keyOf = (logUserId, episodeId) => `${logUserId}:${episodeId}`;
const cache = new Map(); // key -> { reactions: [], comments: [] }
const listeners = new Map(); // key -> Set(fn)
let pending = new Map(); // key -> [{ logUserId, episodeId, resolve }]
let timer = null;

function notify(key) {
  for (const fn of listeners.get(key) || []) fn(cache.get(key));
}

async function flush() {
  timer = null;
  const batch = pending;
  pending = new Map();
  const db = supabase();
  const items = [...batch.values()].map((v) => v[0]);
  const empty = () => ({ reactions: [], comments: [] });
  if (!db || !items.length) {
    for (const [k, waiters] of batch) {
      cache.set(k, empty());
      waiters.forEach((w) => w.resolve(cache.get(k)));
    }
    return;
  }
  const users = [...new Set(items.map((i) => i.logUserId))];
  const eps = [...new Set(items.map((i) => String(i.episodeId)))];
  const [r, c] = await Promise.all([
    db.from("reactions").select("log_user_id, episode_id, user_id, kind").in("log_user_id", users).in("episode_id", eps),
    db
      .from("comments")
      .select("id, log_user_id, episode_id, author_id, body, created_at, author:profiles!comments_author_id_fkey(id, handle, display_name)")
      .in("log_user_id", users)
      .in("episode_id", eps)
      .order("created_at", { ascending: true })
      .limit(1000),
  ]);
  for (const k of batch.keys()) cache.set(k, empty());
  for (const x of r.data || []) cache.get(keyOf(x.log_user_id, x.episode_id))?.reactions.push({ ...x, kind: LEGACY[x.kind] || x.kind });
  for (const x of c.data || []) cache.get(keyOf(x.log_user_id, x.episode_id))?.comments.push(x);
  for (const [k, waiters] of batch) waiters.forEach((w) => w.resolve(cache.get(k)));
}

function loadThread(logUserId, episodeId) {
  const k = keyOf(logUserId, episodeId);
  if (cache.has(k)) return Promise.resolve(cache.get(k));
  return new Promise((resolve) => {
    if (!pending.has(k)) pending.set(k, []);
    pending.get(k).push({ logUserId, episodeId, resolve });
    if (!timer) timer = setTimeout(flush, 0);
  });
}

export function useThread(logUserId, episodeId) {
  const k = keyOf(logUserId, episodeId);
  const [data, setData] = useState(() => cache.get(k) || null);
  useEffect(() => {
    if (!logUserId || !episodeId) return;
    let live = true;
    loadThread(logUserId, episodeId).then((d) => live && setData({ ...d }));
    if (!listeners.has(k)) listeners.set(k, new Set());
    const fn = (d) => live && setData({ ...d });
    listeners.get(k).add(fn);
    return () => {
      live = false;
      listeners.get(k)?.delete(fn);
    };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

function mutate(k, fn) {
  const cur = cache.get(k) || { reactions: [], comments: [] };
  cache.set(k, fn({ reactions: [...cur.reactions], comments: [...cur.comments] }));
  notify(k);
}

export async function toggleReaction(me, logUserId, episodeId, kind) {
  const db = supabase();
  if (!db || !me) throw new Error("Sign in to react.");
  const k = keyOf(logUserId, episodeId);
  const mine = cache.get(k)?.reactions.some((r) => r.user_id === me.id && r.kind === kind);
  // Agree and disagree cancel each other out.
  const opp = OPPOSITE[kind];
  if (!mine && opp && cache.get(k)?.reactions.some((r) => r.user_id === me.id && r.kind === opp)) {
    await toggleReaction(me, logUserId, episodeId, opp);
  }
  if (mine) {
    mutate(k, (d) => ({ ...d, reactions: d.reactions.filter((r) => !(r.user_id === me.id && r.kind === kind)) }));
    const legacy = Object.keys(LEGACY).filter((old) => LEGACY[old] === kind);
    if (legacy.length) await db.from("reactions").delete().eq("log_user_id", logUserId).eq("episode_id", episodeId).eq("user_id", me.id).in("kind", legacy);
    await db.from("reactions").delete().eq("log_user_id", logUserId).eq("episode_id", episodeId).eq("user_id", me.id).eq("kind", kind);
  } else {
    mutate(k, (d) => ({ ...d, reactions: [...d.reactions, { log_user_id: logUserId, episode_id: episodeId, user_id: me.id, kind }] }));
    const { error } = await db.from("reactions").insert({ log_user_id: logUserId, episode_id: episodeId, kind });
    if (error && error.code !== "23505") {
      mutate(k, (d) => ({ ...d, reactions: d.reactions.filter((r) => !(r.user_id === me.id && r.kind === kind)) }));
      throw new Error(error.code === "23514" ? "That reaction isn't available yet. Try again soon." : "Couldn't react. Try again.");
    }
  }
  return !mine;
}

export async function postComment(me, profile, logUserId, episodeId, body) {
  const db = supabase();
  if (!db || !me) throw new Error("Sign in to reply.");
  const text = body.trim().slice(0, 500);
  if (!text) return;
  const { data, error } = await db
    .from("comments")
    .insert({ log_user_id: logUserId, episode_id: episodeId, body: text })
    .select("id, log_user_id, episode_id, author_id, body, created_at")
    .single();
  if (error) throw new Error(profile?.handle ? "Couldn't post. Try again." : "Pick a handle on My log first, then reply.");
  mutate(keyOf(logUserId, episodeId), (d) => ({
    ...d,
    comments: [...d.comments, { ...data, author: { id: me.id, handle: profile?.handle, display_name: profile?.display_name } }],
  }));
}

export async function deleteComment(c) {
  const db = supabase();
  if (!db) return;
  mutate(keyOf(c.log_user_id, c.episode_id), (d) => ({ ...d, comments: d.comments.filter((x) => x.id !== c.id) }));
  await db.from("comments").delete().eq("id", c.id);
}

// ---------- notifications ----------
const NOTE_FIELDS =
  "id, type, episode_id, title, body, read_at, created_at, actor:profiles!notifications_actor_id_fkey(id, handle, display_name), owner:profiles!notifications_log_user_id_fkey(handle)";

export async function fetchNotifications(userId, limit = 60) {
  const db = supabase();
  if (!db || !userId) return [];
  const { data } = await db.from("notifications").select(NOTE_FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return data || [];
}

export async function unreadCount(userId) {
  const db = supabase();
  if (!db || !userId) return 0;
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null);
  return count || 0;
}

export async function markAllRead(userId) {
  const db = supabase();
  if (!db || !userId) return;
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
  window.dispatchEvent(new Event("hooked-notes-read"));
}

export function timeAgo(iso) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
