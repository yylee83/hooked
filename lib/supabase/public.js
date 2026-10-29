// Server-side, read-only access to public data (briefs, recent logs). No login involved.
import "server-only";
import { createClient } from "@supabase/supabase-js";

let client;

export function publicDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export async function getUserBrief(id) {
  const db = publicDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("briefs").select("*, author:profiles(handle)").eq("id", id).maybeSingle();
  return data;
}

export async function recentBriefs(limit = 12) {
  const db = publicDb();
  if (!db) return [];
  const { data } = await db
    .from("briefs")
    .select("id, title, dek, topic, color, mode, total_seconds, items, created_at, author:profiles(handle)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}
