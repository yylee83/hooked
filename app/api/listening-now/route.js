// "Listening on Hooked now" on Home for signed-out visitors (components/ListeningOnHooked.js): what people played in the
// last day, grouped by episode, with how many people have it on. Episodes only: no handles or account ids leave the
// server (Erin, 2026-11-18). Signed in, Home shows "Friends listening now" (people you follow, with names) instead.
import { publicDb } from "@/lib/supabase/public";

const DAY = 24 * 3600 * 1000;
const MAX = 10;

export async function GET() {
  const db = publicDb();
  if (!db) return Response.json({ episodes: [] });
  const { data } = await db
    .from("profiles")
    .select("now_playing, now_playing_at")
    .gte("now_playing_at", new Date(Date.now() - DAY).toISOString())
    .not("now_playing", "is", null)
    .order("now_playing_at", { ascending: false })
    .limit(300);
  const byEp = new Map();
  for (const p of data || []) {
    const e = p.now_playing || {};
    const key = e.ref || (e.id != null ? `p${e.id}` : "");
    if (!key || !e.title) continue;
    const at = Date.parse(p.now_playing_at) || 0;
    const cur = byEp.get(key);
    if (cur) {
      cur.listeners++;
      cur.at = Math.max(cur.at, at);
    } else {
      byEp.set(key, {
        ref: e.ref || undefined,
        id: e.id ?? undefined,
        title: String(e.title).slice(0, 300),
        feedTitle: String(e.feedTitle || "").slice(0, 200),
        image: typeof e.image === "string" ? e.image : "",
        listeners: 1,
        at,
      });
    }
  }
  const episodes = [...byEp.values()].sort((a, b) => b.listeners - a.listeners || b.at - a.at).slice(0, MAX).map(({ at, ...rest }) => rest);
  return Response.json({ episodes }, { headers: { "Cache-Control": "public, s-maxage=120" } });
}
