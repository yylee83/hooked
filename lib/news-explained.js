// Search's "In the news, explained" (YY, 2026-11-25): the week's big stories, each with a fresh episode that catches
// you up and one or two older episodes that go deeper. It replaced the Google Trends bar, whose topics were hours
// old, before any good episode about them existed.
//
// How: news podcasts pick the topics. We read the past week of episodes from a handful of daily news shows and group
// them by the names they share (lib/news-topics.js); a topic needs at least two shows. For each, the best fresh
// episode is the "catch up", and an episode search for the topic finds older episodes (6+ weeks old, any show) with
// the topic in their title for "go deeper". Topics without a deeper episode are left out.
// Google Trends (lib/trends.js) only nudges the order: a topic people are also searching for comes first.
import "server-only";
import { unstable_cache } from "next/cache";
import { episodeCard, getEpisodes, getShow, getShowByItunesId, findShow, plainText, searchEpisodes } from "./podcastindex";
import { groupTopics, mentions } from "./news-topics";
import { trendingTopics } from "./trends";
import { withRefs } from "./catalog";

// Daily news shows that explain one story at a time, best explainers first (that order picks the "catch up").
// Apple ids find them in Podcast Index; the name is checked, and searched for if the id doesn't match.
export const NEWS_SHOWS = [
  { name: "Today, Explained", apple: "1346207297" },
  { name: "The Daily", apple: "1200361736" },
  { name: "Post Reports", apple: "1444873564" },
  { name: "The Journal.", apple: "1469394914" },
  { name: "Consider This from NPR", apple: "1503226625" },
  { name: "What Next", apple: "1414238719" },
  { name: "The Intelligence from The Economist", apple: "151230264" },
  { name: "Front Burner", apple: "1439621628" },
  { name: "Up First", apple: "1222114325" },
  { name: "Apple News Today", apple: "1513325580" },
];

const DAY = 86400;
const WEEK = 7 * DAY;
const DEEPER_MIN_AGE = 42 * DAY; // "go deeper" is background: at least six weeks old
const MAX_TOPICS = 5;

const simple = (s = "") => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const sameName = (a, b) => {
  const x = simple(a).replace(/^the /, "");
  const y = simple(b).replace(/^the /, "");
  return x && y && (x === y || x.startsWith(y) || y.startsWith(x));
};

async function newsShow({ name, apple }) {
  const byApple = await getShowByItunesId(apple).catch(() => null);
  if (byApple && sameName(byApple.title, name)) return byApple;
  const found = await findShow(name).catch(() => null);
  return found && sameName(found.title, name) ? found : null;
}

async function thisWeek() {
  const shows = (await Promise.all(NEWS_SHOWS.map(newsShow))).filter(Boolean);
  const since = Date.now() / 1000 - WEEK;
  const lists = await Promise.all(
    shows.map(async (show, order) => {
      const items = await getEpisodes(show.id, 25).catch(() => []);
      return items
        .filter((e) => e.datePublished >= since && e.enclosureUrl)
        .map((e) => ({ ...e, feedId: e.feedId || show.id, show, order, description: plainText(e.description || "").slice(0, 600), date: e.datePublished }));
    })
  );
  return { shows, episodes: lists.flat() };
}

// Older episodes with the topic in the title, from different shows, the most popular and substantial first.
async function deeper(topic, newsIds, skip) {
  const cutoff = Date.now() / 1000 - DEEPER_MIN_AGE;
  const found = await searchEpisodes(topic, 40).catch(() => []);
  const picks = [];
  const showsUsed = new Set();
  const ok = found.filter((e) => e.id && !e.appleOnly && e.enclosureUrl && e.datePublished && e.datePublished < cutoff && !skip.has(e.id) && mentions(e.title, topic) && (!e.duration || e.duration >= 12 * 60));
  // Shows that aren't daily news first: they tend to be the deeper dives. searchEpisodes' own order otherwise.
  const ordered = [...ok.filter((e) => !newsIds.has(e.feedId)), ...ok.filter((e) => newsIds.has(e.feedId))];
  for (const e of ordered) {
    if (showsUsed.has(e.feedId)) continue;
    showsUsed.add(e.feedId);
    picks.push(e);
    if (picks.length === 2) break;
  }
  return picks;
}

async function build() {
  const { shows, episodes } = await thisWeek();
  if (!episodes.length) throw new Error("No news episodes"); // not kept: try again next time
  const trends = await trendingTopics(25).then((t) => t.map((x) => x.topic)).catch(() => []);
  const groups = groupTopics(episodes, { trends, max: MAX_TOPICS + 3 });
  const newsIds = new Set(shows.map((s) => s.id));

  const topics = await Promise.all(
    groups.map(async (g) => {
      // The catch-up: an episode with the topic in its title, from the best explainer show, newest first.
      const titled = g.episodes.filter((e) => mentions(e.title, g.topic));
      const pool = titled.length ? titled : g.episodes;
      const fresh = [...pool].sort((a, b) => a.order - b.order || b.date - a.date)[0];
      const more = await deeper(g.topic, newsIds, new Set(g.episodes.map((e) => e.id)));
      if (!fresh || !more.length) return null;
      const showOf = async (e) => (e.feedTitle ? null : await getShow(e.feedId).catch(() => null));
      const cards = await withRefs([episodeCard(fresh, fresh.show), ...(await Promise.all(more.map(async (e) => episodeCard(e, await showOf(e)))))]);
      return { topic: g.topic, shows: g.shows, fresh: cards[0], deeper: cards.slice(1) };
    })
  );
  const out = topics.filter(Boolean).slice(0, MAX_TOPICS);
  if (!out.length) throw new Error("No topics with a deeper episode");
  return out;
}

// Made at most every 3 hours (news shows publish once or twice a day); a failed or empty try isn't kept.
const cached = unstable_cache(build, ["news-explained", "v1"], { revalidate: 3 * 3600 });

/** [{ topic, shows, fresh: card, deeper: [card…] }], or [] when nothing strong enough is found. */
export async function newsExplained() {
  try {
    return await cached();
  } catch {
    return [];
  }
}
