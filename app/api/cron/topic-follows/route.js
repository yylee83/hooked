// Daily: "Follow topic" (YY, 2026-11-25). For each topic someone follows ("Marc Maron", "Venezuela"), find episodes
// about it published since we last looked, and add ONE notification per topic (YY: bundled, not one per episode):
// "9 new episodes about Jensen Huang", which opens the list at /search/topic. See lib/topic-alerts.js.
// The 14:00 notification-email job puts it in the same daily email. Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET.
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { alertBody, episodesAbout } from "@/lib/topic-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 86400;
const MAX_TOPICS = 80; // per run; the rest wait a day (busiest first would be fairer once this is big)

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "No database key" }, { status: 500 });
  const { data: follows, error } = await db.from("topic_follows").select("user_id, topic_key, topic, created_at, notified_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!follows?.length) return NextResponse.json({ follows: 0, sent: 0 });

  // One search per topic, from the earliest point anyone following it still needs (at most 3 days back).
  const now = Date.now() / 1000;
  const since = (f) => Math.max(new Date(f.notified_at || f.created_at).getTime() / 1000, now - 3 * DAY);
  const topics = new Map();
  for (const f of follows) {
    const t = topics.get(f.topic_key);
    if (!t) topics.set(f.topic_key, { topic: f.topic, after: since(f) });
    else t.after = Math.min(t.after, since(f));
  }
  const keys = [...topics.keys()].slice(0, MAX_TOPICS);
  const found = new Map();
  for (let i = 0; i < keys.length; i += 5) {
    await Promise.all(keys.slice(i, i + 5).map(async (k) => found.set(k, await episodesAbout(topics.get(k).topic, topics.get(k).after, now))));
  }

  let sent = 0;
  for (const f of follows) {
    const eps = (found.get(f.topic_key) || []).filter((e) => e.datePublished > since(f));
    if (!eps.length) continue;
    const { error: err } = await db
      .from("notifications")
      .insert({ user_id: f.user_id, type: "topic", title: f.topic, body: alertBody(eps.length, since(f), now) });
    if (!err) sent++;
    await db
      .from("topic_follows")
      .update({ notified_at: new Date(now * 1000).toISOString() })
      .eq("user_id", f.user_id)
      .eq("topic_key", f.topic_key);
  }
  return NextResponse.json({ follows: follows.length, topics: keys.length, sent });
}
