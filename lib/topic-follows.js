"use client";
// "Follow topic" (YY, 2026-11-25): follow any person or subject ("Marc Maron", "Venezuela") from a search or a news card
// on Search, and hear about each new episode about it (table topic_follows, your own rows only; a daily job adds the
// notifications, app/api/cron/topic-follows).
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/client";

/** A topic in plain lower case ("marc maron"): how follows are matched. Same as topicKey in lib/news-topics.js. */
export const topicKeyOf = (s = "") =>
  String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 80);

let rows = null; // [{ topic_key, topic }], once loaded
let loadedFor = null;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));

async function load(uid) {
  if (!uid || loadedFor === uid) return;
  loadedFor = uid;
  const db = supabase();
  const { data } = db ? await db.from("topic_follows").select("topic_key, topic").eq("user_id", uid).order("created_at") : { data: [] };
  rows = data || [];
  emit();
}

/** { ready, list, following(topic), toggle(topic) } for the signed-in person (uid). */
export function useTopicFollows(uid) {
  useEffect(() => {
    load(uid);
  }, [uid]);
  const snap = useSyncExternalStore(subscribe, () => rows, () => null);
  const has = (key) => !!snap?.some((r) => r.topic_key === key);
  return {
    ready: !!snap,
    list: snap || [],
    following: (topic) => has(topicKeyOf(topic)),
    async toggle(topic) {
      const db = supabase();
      const key = topicKeyOf(topic);
      if (!db || !uid || !rows || key.length < 2) return;
      const before = rows;
      const on = has(key);
      rows = on ? rows.filter((r) => r.topic_key !== key) : [...rows, { topic_key: key, topic: topic.trim().slice(0, 80) }];
      emit();
      const { error } = on
        ? await db.from("topic_follows").delete().eq("user_id", uid).eq("topic_key", key)
        : await db.from("topic_follows").upsert({ user_id: uid, topic_key: key, topic: topic.trim().slice(0, 80) }, { onConflict: "user_id,topic_key" });
      if (error) {
        rows = before;
        emit();
      }
    },
  };
}
