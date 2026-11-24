"use client";
// "Your reach" (Erin, 2026-11-24): how many people want to listen, and how many episodes went on someone's Up next,
// because of your reviews and sends. Your own totals only, read through my_reach
// (supabase/migrations/20261125120000_influences.sql). Signed out, or before that migration runs: null.

import { useEffect, useState } from "react";
import { supabase } from "./supabase/client";

const FRESH = 60_000; // ask again at most once a minute
let cache = null; // { user, at, promise }

function load(userId) {
  if (cache && cache.user === userId && Date.now() - cache.at < FRESH) return cache.promise;
  const client = supabase();
  const promise = !client
    ? Promise.resolve(null)
    : client.rpc("my_reach").then(({ data, error }) => (error || !data ? null : { people: Number(data.people) || 0, added: Number(data.added) || 0 }), () => null);
  cache = { user: userId, at: Date.now(), promise };
  return promise;
}

/** `undefined` while loading, `null` when there's nothing to show (no id, signed out, not available), else
 *  { people, added }. Pass null to skip asking (someone else's profile). */
export function useMyReach(userId) {
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
