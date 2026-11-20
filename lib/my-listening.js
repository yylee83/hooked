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
