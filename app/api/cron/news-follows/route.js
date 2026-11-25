// Daily: "Follow this story" (Search's "In the news, explained"). For each story someone follows, if a news show has a
// new episode about it since we last told them, add a notification (type 'story': title = the episode, body = the
// story). One a day per story at most: the newest episode. Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET.
import { NextResponse } from "next/server";
import { thisWeek } from "@/lib/news-explained";
import { mentions } from "@/lib/news-topics";
import { episodeRefFor } from "@/lib/catalog";
import { adminDb } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "No database key" }, { status: 500 });
  const { data: follows, error } = await db.from("story_follows").select("user_id, topic_key, topic, created_at, notified_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!follows?.length) return NextResponse.json({ follows: 0, sent: 0 });

  const { episodes } = await thisWeek();
  const newestFor = new Map(); // topic key → newest news episode about it
  for (const f of follows) {
    if (newestFor.has(f.topic_key)) continue;
    const hits = episodes.filter((e) => mentions(`${e.title}. ${e.description}`, f.topic)).sort((a, b) => b.date - a.date);
    newestFor.set(f.topic_key, hits[0] || null);
  }

  let sent = 0;
  for (const f of follows) {
    const e = newestFor.get(f.topic_key);
    if (!e) continue;
    const after = Math.max(new Date(f.notified_at || f.created_at).getTime() / 1000, 0);
    if (e.date <= after) continue;
    const ref = await episodeRefFor(e.id).catch(() => null);
    const { error: err } = await db.from("notifications").insert({
      user_id: f.user_id,
      type: "story",
      episode_id: e.id,
      episode_ref: ref,
      title: e.title,
      body: f.topic,
    });
    if (err) continue;
    await db.from("story_follows").update({ notified_at: new Date(e.date * 1000).toISOString() }).eq("user_id", f.user_id).eq("topic_key", f.topic_key);
    sent++;
  }
  return NextResponse.json({ follows: follows.length, sent });
}
