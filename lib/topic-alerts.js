// "Follow topic" alerts (YY, 2026-11-25): the daily job (app/api/cron/topic-follows) and the list page it links to
// (app/search/topic) both use this, so the count in an alert matches the episodes on its page.
// Alerts are bundled (YY, 2026-11-25): one notification per topic per day, "9 new episodes about Jensen Huang",
// stored as type 'topic' with title = the topic and body = "<count>|<since>|<until>" (unix seconds).
import { getShow, plainText, searchEpisodes } from "@/lib/podcastindex";
import { mentions } from "@/lib/news-topics";

export const MAX_PER_ALERT = 30;

// Episodes about a topic published after `after` and up to `until` (unix seconds), newest first. The episode must
// name the topic in its title or notes; episodes from the topic's own show (named for it or made by it, like Marc
// Maron's WTF) are left out: following a person means hearing them somewhere new.
export async function episodesAbout(topic, after, until = Infinity, max = MAX_PER_ALERT) {
  const found = await searchEpisodes(topic, 60).catch(() => []);
  const fresh = found.filter(
    (e) => e.id && !e.appleOnly && e.datePublished > after && e.datePublished <= until && mentions(`${e.title}. ${plainText(e.description || "")}`, topic)
  );
  const shows = new Map();
  const out = [];
  for (const e of fresh.sort((a, b) => b.datePublished - a.datePublished)) {
    if (!shows.has(e.feedId)) shows.set(e.feedId, await getShow(e.feedId).catch(() => null));
    const show = shows.get(e.feedId);
    if (mentions(`${show?.title || e.feedTitle || ""} ${show?.author || ""} ${show?.ownerName || ""}`, topic)) continue;
    out.push({ ...e, feedTitle: e.feedTitle || show?.title || "" });
    if (out.length === max) break;
  }
  return out;
}

export { alertBody, readAlert } from "@/lib/topic-alert-words";
