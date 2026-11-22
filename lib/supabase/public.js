// Server-side, read-only access to public data (briefs, recent logs). No login involved.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { HOOKED_SHOW, LOG_EPISODE, withEpisode, withShow } from "@/lib/log-episode";

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

// Published listener briefs that include an episode (`ref`: our short id), newest first. Drafts never show here.
export async function briefsWithEpisode(ref, limit = 6) {
  const db = publicDb();
  if (!db || !/^[a-z2-9]{8}$/.test(String(ref || ""))) return [];
  const { data } = await db
    .from("briefs")
    .select("id, title, color, author:profiles!briefs_author_id_fkey(handle)")
    .eq("draft", false)
    .contains("items", JSON.stringify([{ episodeRef: ref }]))
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
    db.from("logs").select(`episode_ref, rating, hook, logged_at, ${LOG_EPISODE}`).eq("user_id", profile.id).order("logged_at", { ascending: false }).limit(200),
    db.from("hooked_shows").select(`show_ref, created_at, ${HOOKED_SHOW}`, { count: "exact" }).eq("user_id", profile.id).order("created_at", { ascending: false }).limit(12),
    db.from("briefs").select("id, title, color, mode, total_seconds, items").eq("author_id", profile.id).order("created_at", { ascending: false }).limit(12),
    db.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", profile.id),
    db.from("follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", profile.id),
  ]);
  return {
    profile,
    logs: (logs.data || []).map(withEpisode),
    shows: (shows.data || []).map(withShow),
    hookedCount: shows.count ?? (shows.data || []).length, // all of them; `shows` is the newest 12
    briefs: briefs.data || [],
    followers: followers.count || 0,
    following: following.count || 0,
  };
}

// One person's log of one episode (for share links). `ep` is { ref }: our short id. Every log has
// one, so an episode we don't have yet has no logs.
export async function getSharedLog(handle, ep) {
  const db = publicDb();
  const profile = await getProfile(handle);
  if (!profile) return null;
  if (!/^[a-z2-9]{8}$/.test(String(ep?.ref || ""))) return { profile, log: null };
  const { data } = await db.from("logs").select("rating, hook, logged_at").eq("user_id", profile.id).eq("episode_ref", ep.ref).maybeSingle();
  return { profile, log: data };
}

// How everyone on Hooked rates a show: the average of all episode ratings for it, and % hooked (Decision 6): of the
// people who logged any episode of it, the share who are hooked on the show (so it can't pass 100%).
// `show` is { ref }: logs are matched to our show through their episode. A show we don't have yet has no logs.
export async function showStats(show) {
  const db = publicDb();
  if (!db || !/^[a-z2-9]{8}$/.test(String(show?.ref || ""))) return null;
  const [{ data }, { data: hooks }] = await Promise.all([
    db.from("logs").select("user_id, rating, episode:episodes!logs_episode_ref_fkey!inner(show_id)").eq("episode.show_id", show.ref).limit(2000),
    db.from("hooked_shows").select("user_id").eq("show_ref", show.ref).limit(5000),
  ]);
  if (!data?.length) return null;
  const listeners = new Set(data.map((l) => l.user_id));
  const hooked = (hooks || []).filter((h) => listeners.has(h.user_id)).length;
  const rated = data.filter((l) => l.rating > 0);
  return {
    logs: data.length,
    listeners: listeners.size,
    avg: rated.length ? rated.reduce((a, l) => a + Number(l.rating), 0) / rated.length : 0,
    hookedPct: Math.round((hooked / listeners.size) * 100),
  };
}
