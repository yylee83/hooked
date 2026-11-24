"use client";
// Your own listening in Hooked's player, for Wrapped and the numbers on My log (YY, 2026-11-20: stats come from what
// you actually play here, with your logs underneath). Totals only, read through my_listening
// (supabase/migrations/20261120120000_my_listening.sql). Signed out, or before that migration runs: null.

import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

const FRESH = 60_000; // ask again at most once a minute
let cache = null; // { user, at, promise }

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function load(userId) {
  if (cache && cache.user === userId && Date.now() - cache.at < FRESH) return cache.promise;
  const client = supabase();
  const promise = !client
    ? Promise.resolve(null)
    : client
    .rpc("my_listening", { p_tz: timeZone() })
    .then(({ data, error }) => (error || !data ? null : data), () => null);
  cache = { user: userId, at: Date.now(), promise };
  return promise;
}

/** `undefined` while loading, `null` when there's nothing to show (signed out, or not available), else the totals:
 *  { seconds, episodes, finished, since, days[7] (Sunday first), hours[24], shows: [{ id, title, image, podcastindex_id, seconds, episodes }] } */
export function useMyListening(userId) {
  const [got, setGot] = useState(null); // { user, data }
  useEffect(() => {
    if (!userId) return;
    let live = true;
    load(userId).then((data) => live && setGot({ user: userId, data }));
    return () => {
      live = false;
    };
  }, [userId]);
  if (!userId) return null;
  return got?.user === userId ? got.data : undefined;
}

/** Hours, rounded the way people say them: 0.4, 3.5, 12. */
export function listenedHours(sec) {
  const h = (sec || 0) / 3600;
  return h >= 10 ? Math.round(h) : Math.round(h * 10) / 10;
}

// ---------- your reviews and replies ----------
// Replies and reactions are public (anyone can read them on episode pages), so these are plain counts on those tables.
const THUMBS = ["agree", "great", "same", "ooh"];
let talkCache = null; // { user, at, promise }

function loadTalk(userId) {
  if (talkCache && talkCache.user === userId && Date.now() - talkCache.at < FRESH) return talkCache.promise;
  const db = supabase();
  const count = (q) => q.then((r) => (r.error ? null : r.count ?? 0), () => null);
  const promise = !db
    ? Promise.resolve(null)
    : Promise.all([
        count(db.from("comments").select("id", { count: "exact", head: true }).eq("author_id", userId)),
        db.from("comments").select("episode_ref").eq("log_user_id", userId).neq("author_id", userId).limit(1000).then((r) => (r.error ? null : r.data), () => null),
        count(db.from("reactions").select("kind", { count: "exact", head: true }).eq("log_user_id", userId).neq("user_id", userId).in("kind", THUMBS)),
        // + on your reviews: who tapped it, so each person counts once however many of your reviews they added.
        db.from("reactions").select("user_id").eq("log_user_id", userId).neq("user_id", userId).eq("kind", "adding").limit(1000).then((r) => (r.error ? null : r.data), () => null),
      ]).then(([written, got, thumbs, adds]) => {
        if (written == null && got == null) return null;
        // Which of your reviews got the most replies.
        const per = {};
        for (const r of got || []) per[r.episode_ref] = (per[r.episode_ref] || 0) + 1;
        const [topRef, topN] = Object.entries(per).sort((a, b) => b[1] - a[1])[0] || [];
        return { written: written || 0, got: (got || []).length, thumbs: thumbs || 0, adds: new Set((adds || []).map((r) => r.user_id)).size, talkiest: topRef ? { ref: topRef, replies: topN } : null };
      });
  talkCache = { user: userId, at: Date.now(), promise };
  return promise;
}

/** Your reviews and replies: { written, got, thumbs, adds, talkiest: { ref, replies } }. Same states as useMyListening. */
export function useMyTalk(userId) {
  const [got, setGot] = useState(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    loadTalk(userId).then((data) => live && setGot({ user: userId, data }));
    return () => {
      live = false;
    };
  }, [userId]);
  if (!userId) return null;
  return got?.user === userId ? got.data : undefined;
}
