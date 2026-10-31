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
  const { data } = await db.from("briefs").select("*, author:profiles!briefs_author_id_fkey(handle)").eq("id", id).maybeSingle();
  return data;
}

export async function recentBriefs(limit = 12) {
  const db = publicDb();
  if (!db) return [];
  const { data } = await db
    .from("briefs")
    .select("id, title, dek, topic, color, mode, total_seconds, items, created_at, author:profiles!briefs_author_id_fkey(handle)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ---------- public profiles ----------
const HANDLE = /^[a-z0-9._]{2,24}$/;

export async function getProfile(handle) {
  const db = publicDb();
  const h = String(handle || "").toLowerCase().replace(/^@/, "");
  if (!db || !HANDLE.test(h)) return null;
  const { data } = await db.from("profiles").select("id, handle, display_name, created_at").eq("handle", h).maybeSingle();
  return data;
}

export async function getProfilePage(handle) {
  const db = publicDb();
  const profile = await getProfile(handle);
  if (!profile) return null;
  const [logs, shows, briefs, followers, following] = await Promise.all([
    db.from("logs").select("*").eq("user_id", profile.id).order("logged_at", { ascending: false }).limit(200),
    db.from("hooked_shows").select("feed_id, title, image, created_at").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(12),
    db.from("briefs").select("id, title, color, mode, total_seconds, items").eq("author_id", profile.id).order("created_at", { ascending: false }).limit(12),
    db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", profile.id),
    db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", profile.id),
  ]);
  return {
    profile,
    logs: logs.data || [],
    shows: shows.data || [],
    briefs: briefs.data || [],
    followers: followers.count || 0,
    following: following.count || 0,
  };
}

// One person's log of one episode (for share links).
export async function getSharedLog(handle, episodeId) {
  const db = publicDb();
  const profile = await getProfile(handle);
  if (!profile || !/^\d+$/.test(String(episodeId))) return profile ? { profile, log: null } : null;
  const { data } = await db.from("logs").select("hooked, rating, hook, logged_at").eq("user_id", profile.id).eq("episode_id", episodeId).maybeSingle();
  return { profile, log: data };
}

// How everyone on Hooked rates a show: the average of all episode ratings for it.
export async function showStats(feedId) {
  const db = publicDb();
  if (!db || !/^\d+$/.test(String(feedId))) return null;
  const { data } = await db.from("logs").select("user_id, rating, hooked").eq("feed_id", feedId).limit(2000);
  if (!data?.length) return null;
  const rated = data.filter((l) => l.rating > 0);
  return {
    logs: data.length,
    listeners: new Set(data.map((l) => l.user_id)).size,
    avg: rated.length ? rated.reduce((a, l) => a + Number(l.rating), 0) / rated.length : 0,
    hookedPct: Math.round((data.filter((l) => l.hooked).length / data.length) * 100),
  };
}
