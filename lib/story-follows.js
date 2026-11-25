"use client";
// "Follow this story" on Search's "In the news, explained": your followed stories (table story_follows, your own rows
// only). A daily job tells you when a news show covers one again (app/api/cron/news-follows).
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/client";

let keys = null; // Set of followed topic keys, once loaded
let loadedFor = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));

async function load(uid) {
  if (!uid || loadedFor === uid) return;
  loadedFor = uid;
  const db = supabase();
  const { data } = db ? await db.from("story_follows").select("topic_key").eq("user_id", uid) : { data: [] };
  keys = new Set((data || []).map((r) => r.topic_key));
  emit();
}

/** Whether you follow each story: { following(key), toggle(key, topic) }. */
export function useStoryFollows(uid) {
  useEffect(() => {
    load(uid);
  }, [uid]);
  const snap = useSyncExternalStore(subscribe, () => keys, () => null);
  return {
    ready: !!snap,
    following: (key) => !!snap?.has(key),
    async toggle(key, topic) {
      const db = supabase();
      if (!db || !uid || !keys) return;
      const on = keys.has(key);
      keys = new Set(keys);
      on ? keys.delete(key) : keys.add(key);
      emit();
      const { error } = on
        ? await db.from("story_follows").delete().eq("user_id", uid).eq("topic_key", key)
        : await db.from("story_follows").upsert({ user_id: uid, topic_key: key, topic }, { onConflict: "user_id,topic_key" });
      if (error) {
        keys = new Set(keys);
        on ? keys.add(key) : keys.delete(key);
        emit();
      }
    },
  };
}
