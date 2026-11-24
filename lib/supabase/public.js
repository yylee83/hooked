// Server-side, read-only access to public data (briefs, recent logs). No login involved.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { HOOKED_SHOW, LOG_EPISODE, withEpisode, withShow } from "@/lib/log-episode";
import { reviewScore } from "@/lib/review-score";

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
    ratings: rated.length,
    hookedPct: Math.round((hooked / listeners.size) * 100),
  };
}

// The reviews on an episode page, most useful first: the same list the page loads in the browser (EpisodeLogs in
// components/Account.js), read on the server so it's part of the page. Public reviews only (logs are public).
export async function episodeReviews(ref, limit = 20) {
  const db = publicDb();
  if (!db || !/^[a-z2-9]{8}$/.test(String(ref || ""))) return null;
  const [l, r, c] = await Promise.all([
    db
      .from("logs")
      .select("user_id, rating, hook, logged_at, who:profiles!logs_user_id_fkey!inner(handle)")
      .eq("episode_ref", ref)
      .not("who.handle", "is", null)
      .order("logged_at", { ascending: false })
      .limit(50),
    db.from("reactions").select("log_user_id, kind").eq("episode_ref", ref).limit(2000),
    db.from("comments").select("log_user_id").eq("episode_ref", ref).limit(2000),
  ]);
  if (l.error) return null; // let the browser try
  const by = (rows, id) => (rows || []).filter((x) => x.log_user_id === id);
  const scored = (l.data || []).map((x) => ({
    ...x,
    score: reviewScore({ reactions: by(r.data, x.user_id), comments: by(c.data, x.user_id), hook: x.hook }),
  }));
  scored.sort((a, b) => b.score - a.score || new Date(b.logged_at) - new Date(a.logged_at));
  return scored.slice(0, limit);
}

// For the sitemap: episodes and shows people have logged, newest activity first. Public logs only.
export async function loggedRefs(limit = 5000) {
  const db = publicDb();
  if (!db) return { episodes: [], shows: [] };
  const { data } = await db
    .from("logs")
    .select("episode_ref, logged_at, episode:episodes!logs_episode_ref_fkey(show_id)")
    .not("episode_ref", "is", null)
    .order("logged_at", { ascending: false })
    .limit(limit);
  const episodes = new Map();
  const shows = new Map();
  for (const l of data || []) {
    if (!episodes.has(l.episode_ref)) episodes.set(l.episode_ref, l.logged_at);
    const show = l.episode?.show_id;
    if (show && !shows.has(show)) shows.set(show, l.logged_at);
  }
  return { episodes: [...episodes], shows: [...shows] };
}

// For the sitemap: published listener lists.
export async function publishedBriefIds(limit = 1000) {
  const db = publicDb();
  if (!db) return [];
  const { data } = await db.from("briefs").select("id, created_at").eq("draft", false).order("created_at", { ascending: false }).limit(limit);
  return data || [];
}
