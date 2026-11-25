// Daily: "Follow topic" (YY, 2026-11-25). For each topic someone follows ("Marc Maron", "Venezuela"), find episodes
// about it published since we last looked (an episode search: Apple plus Podcast Index's person and text search), and
// add a notification for each (type 'topic': title = the episode, body = the topic), up to 3 a day per topic. The
// episode must name the topic in its title or notes, and episodes from the topic's own show (one named for it or made
// by it, like Marc Maron's WTF) are left out: following a person means hearing them somewhere new.
// The 14:00 notification-email job emails them. Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET.
import { NextResponse } from "next/server";
import { getShow, plainText, searchEpisodes } from "@/lib/podcastindex";
import { mentions } from "@/lib/news-topics";
import { episodeRefFor } from "@/lib/catalog";
import { adminDb } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY = 86400;
const PER_TOPIC = 3;
const MAX_TOPICS = 80; // per run; the rest wait a day (busiest first would be fairer once this is big)

// New episodes about a topic since `after` (unix seconds), newest first.
async function newAbout(topic, after) {
  const found = await searchEpisodes(topic, 40).catch(() => []);
  const fresh = found.filter((e) => e.id && !e.appleOnly && e.datePublished > after && mentions(`${e.title}. ${plainText(e.description || "")}`, topic));
  const out = [];
  for (const e of fresh.sort((a, b) => b.datePublished - a.datePublished)) {
    const show = await getShow(e.feedId).catch(() => null);
    if (mentions(`${show?.title || e.feedTitle || ""} ${show?.author || ""} ${show?.ownerName || ""}`, topic)) continue; // their own show
    out.push({ ...e, feedTitle: e.feedTitle || show?.title || "" });
    if (out.length === PER_TOPIC) break;
  }
  return out;
}

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
    await Promise.all(keys.slice(i, i + 5).map(async (k) => found.set(k, await newAbout(topics.get(k).topic, topics.get(k).after))));
  }

  let sent = 0;
  for (const f of follows) {
    const eps = (found.get(f.topic_key) || []).filter((e) => e.datePublished > since(f));
    if (!eps.length) continue;
    for (const e of eps) {
      const ref = await episodeRefFor(e.id).catch(() => null);
      const { error: err } = await db.from("notifications").insert({ user_id: f.user_id, type: "topic", episode_id: e.id, episode_ref: ref, title: e.title, body: f.topic });
      if (!err) sent++;
    }
    await db
      .from("topic_follows")
      .update({ notified_at: new Date(Math.max(...eps.map((e) => e.datePublished)) * 1000).toISOString() })
      .eq("user_id", f.user_id)
      .eq("topic_key", f.topic_key);
  }
  return NextResponse.json({ follows: follows.length, topics: keys.length, sent });
}
