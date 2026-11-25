// Search's "In the news, explained" (YY, 2026-11-25): chips of the week's big stories; each opens a card with a fresh
// episode that catches you up and one or two older episodes that go deeper. It replaced the Google Trends bar, whose
// topics were hours old, before any good episode about them existed.
//
// How a story is found: news podcasts pick them. We read the past week of episodes from a handful of daily news shows
// and group them by the names they share (lib/news-topics.js); a story needs at least two shows.
//
// How "Go deeper" is picked, best signal first:
//   1. Pins and blocks from the team (Supabase table news_picks).
//   2. Past episodes the news show itself links to in its notes (hand-picked background).
//   3. An episode search for the story, keeping episodes 6+ weeks old with the story in the title, at least 12 minutes.
//      Shows on the trusted shelf (lib/news-shelf.js) and the news shows themselves are in; any other show must have
//      40+ episodes and be on Apple's top 100 or well rated / finished on Hooked.
//   4. Ranking: linked > shelf > chart, plus how people on Hooked finished and rated them (news_quality).
//   5. Claude reads the news episode next to the top candidates and keeps only those that give real, still-accurate
//      background, with a one-line reason; it also names the story and writes one line on it (lib/news-claude.js).
//      Without ANTHROPIC_API_KEY, the ranking alone decides.
// Stories without a "Go deeper" episode are left out. Google Trends (lib/trends.js) only nudges the order.
import "server-only";
import { unstable_cache } from "next/cache";
import { episodeCard, findEpisode, getEpisode, getEpisodes, getShow, getShowByItunesId, findShow, plainText, searchEpisodes } from "./podcastindex";
import { groupTopics, mentions, topicKey } from "./news-topics";
import { onShelf } from "./news-shelf";
import { claudeEditor } from "./news-claude";
import { chartItunesIds } from "./charts";
import { trendingTopics } from "./trends";
import { withRefs } from "./catalog";
import { adminDb } from "./supabase/admin";
import { publicDb } from "./supabase/public";
import { resolveLink } from "./links";

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
const DEEPER_MIN_AGE = 21 * DAY; // background: at least three weeks old (was six; too few stories had one, YY 2026-11-25)
const LINKED_MIN_AGE = 14 * DAY; // what a news show links to can be newer
const MIN_LENGTH = 12 * 60;
const MAX_TOPICS = 8;
const TO_CLAUDE = 8;

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

/** The past week of news-show episodes: { shows, episodes, since }. Also used by the daily "Follow this story" job. */
export async function thisWeek() {
  const shows = (await Promise.all(NEWS_SHOWS.map(newsShow))).filter(Boolean);
  const since = Math.floor(Date.now() / 1000 - WEEK);
  const lists = await Promise.all(
    shows.map(async (show, order) => {
      const items = await getEpisodes(show.id, 25).catch(() => []);
      return items
        .filter((e) => e.datePublished >= since && e.enclosureUrl)
        .map((e) => ({ ...e, feedId: e.feedId || show.id, show, order, html: e.description || "", description: plainText(e.description || "").slice(0, 900), date: e.datePublished }));
    })
  );
  return { shows, episodes: lists.flat(), since };
}

// ---------- the team's pins and blocks (news_picks) ----------

async function loadPicks() {
  const db = adminDb();
  if (!db) return [];
  const { data, error } = await db.from("news_picks").select("topic, action, episode_ref, show_ref");
  return error ? [] : data || [];
}

const pickFits = (p, g) => p.topic.trim() === "*" || topicKey(p.topic) === g.key || mentions(g.topic, p.topic) || mentions(p.topic, g.topic);

// An episode from our own tables, as a card (pins name our ids).
async function cardByRef(ref) {
  const db = publicDb();
  if (!db) return null;
  const { data: r } = await db
    .from("episodes")
    .select("id, podcastindex_id, title, image_url, audio_url, duration_seconds, published_at, show:shows(id, title, image_url, podcastindex_id)")
    .eq("id", ref)
    .maybeSingle();
  if (!r?.audio_url) return null;
  return {
    id: r.podcastindex_id ?? undefined,
    ref: r.id,
    title: r.title,
    feedId: r.show?.podcastindex_id ?? undefined,
    feedTitle: r.show?.title || "",
    showRef: r.show?.id,
    image: r.image_url || r.show?.image_url || "",
    feedImage: r.show?.image_url || "",
    audio: r.audio_url,
    duration: r.duration_seconds || 0,
    date: r.published_at ? Math.floor(new Date(r.published_at).getTime() / 1000) : 0,
  };
}

// ---------- past episodes the news show links to ----------

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'");

async function linkedEpisodes(fresh) {
  const html = fresh.html || "";
  const found = [];
  // Apple Podcasts links to a specific episode.
  const apple = [...html.matchAll(/href="(https?:\/\/podcasts\.apple\.com\/[^"]+[?&]i=\d+[^"]*)"/gi)].map((m) => decode(m[1])).slice(0, 3);
  for (const url of apple) {
    const r = await resolveLink(url).catch(() => null);
    const e = r?.episodeId ? await getEpisode(r.episodeId).catch(() => null) : null;
    if (e) found.push(e);
  }
  // Link text that names one of the show's own past episodes ("Listen to our episode: The Fight Over …").
  const texts = [...html.matchAll(/<a\b[^>]*>([^<]{12,120})<\/a>/gi)]
    .map((m) => plainText(m[1]).trim())
    .filter((t) => !/^https?:|subscribe|newsletter|transcript|apple podcasts|spotify|sign up|unlock|privacy|learn more/i.test(t))
    .slice(0, 4);
  for (const t of texts) {
    const e = await findEpisode(fresh.feedId, t, 300).catch(() => null);
    if (e) found.push({ ...e, feedTitle: e.feedTitle || fresh.show?.title, feedImage: e.feedImage || fresh.show?.artwork || fresh.show?.image });
  }
  return found;
}

// ---------- quality ----------

async function hookedQuality(episodeRefs, showRefs) {
  const db = adminDb();
  if (!db || (!episodeRefs.length && !showRefs.length)) return { episodes: new Map(), shows: new Map() };
  const { data, error } = await db.rpc("news_quality", { episode_refs: episodeRefs, show_refs: showRefs });
  const rows = error ? [] : data || [];
  const pick = (kind) => new Map(rows.filter((r) => r.kind === kind).map((r) => [r.ref, r]));
  return { episodes: pick("episode"), shows: pick("show") };
}

const wellLiked = (q) => q && ((q.ratings >= 2 && q.avg_rating >= 4) || (q.listeners >= 3 && q.finished / q.listeners >= 0.5));

function listenScore(q) {
  if (!q) return 0;
  let s = 0;
  if (q.listeners >= 2) s += 3 * (q.finished / q.listeners);
  if (q.ratings >= 2) s += 1.5 * (q.avg_rating - 3);
  return s;
}

// ---------- one story ----------

// Why a story has no Go deeper: in the server logs (Vercel → Logs, search "news-explained") and at /api/news-why.
function note(ctx, g, why) {
  const line = `"${g.topic}" (${g.shows} shows): ${why}`;
  ctx.notes.push(line);
  console.log(`news-explained: no Go deeper for ${line}`);
}

async function buildTopic(g, ctx) {
  // The catch-up: an episode with the story in its title, from the best explainer show, newest first.
  const titled = g.episodes.filter((e) => mentions(e.title, g.topic));
  const fresh = [...(titled.length ? titled : g.episodes)].sort((a, b) => a.order - b.order || b.date - a.date)[0];
  if (!fresh) return null;
  const [freshCard] = await withRefs([episodeCard(fresh, fresh.show)]);
  // Go deeper. A story without one still shows, with just its catch-up (YY, 2026-11-25: only two stories had one).
  const found = await findDeeper(g, ctx, fresh).catch((err) => ({ deeper: [], why: `error: ${err?.message || err}` }));
  if (found.why) note(ctx, g, found.why);
  return {
    topic: found.editor?.name || g.topic,
    key: g.key,
    summary: found.editor?.summary || "",
    shows: g.shows,
    fresh: freshCard,
    deeper: found.deeper,
  };
}

async function findDeeper(g, ctx, fresh) {
  const picks = ctx.picks.filter((p) => pickFits(p, g));
  const blockedEps = new Set(picks.filter((p) => p.action === "block" && p.episode_ref).map((p) => p.episode_ref));
  const blockedShows = new Set(picks.filter((p) => p.action === "block" && p.show_ref).map((p) => p.show_ref));
  const pinned = (await Promise.all(picks.filter((p) => p.action === "pin").map((p) => cardByRef(p.episode_ref)))).filter(Boolean);

  const now = Date.now() / 1000;
  const weekIds = new Set(ctx.episodes.map((e) => e.id));
  const [searched, linked] = await Promise.all([searchEpisodes(g.topic, 40).catch(() => []), linkedEpisodes(fresh)]);
  const usable = (e, minAge) => e?.id && !e.appleOnly && e.enclosureUrl && e.datePublished && e.datePublished < now - minAge && !weekIds.has(e.id) && (!e.duration || e.duration >= MIN_LENGTH);
  const pool = new Map();
  for (const e of linked) if (usable(e, LINKED_MIN_AGE)) pool.set(e.id, { e, linked: true, order: 0 });
  // About the story: any of its names in the title, or near the start of the show notes.
  const names = [g.topic, ...(g.names || [])];
  const about = (e) => names.some((n) => mentions(e.title, n) || mentions(plainText(e.description || "").slice(0, 300), n));
  searched.forEach((e, i) => {
    if (!pool.has(e.id) && usable(e, DEEPER_MIN_AGE) && about(e)) pool.set(e.id, { e, linked: false, order: i });
  });
  if (!pool.size && !pinned.length) return { deeper: [], why: `no older episodes about it (searched ${searched.length})` };

  // Show details (name, size, Apple id), our ids, and how people on Hooked listened.
  const feedIds = [...new Set([...pool.values()].map((c) => c.e.feedId))];
  const showInfo = new Map(await Promise.all(feedIds.map(async (id) => [id, await getShow(id).catch(() => null)])));
  const cards = await withRefs([...pool.values()].map((c) => episodeCard(c.e, showInfo.get(c.e.feedId))));
  const cands = [...pool.values()].map((c, i) => ({ ...c, card: cards[i], show: showInfo.get(c.e.feedId) }));
  const q = await hookedQuality(cands.map((c) => c.card.ref).filter(Boolean), [...new Set(cands.map((c) => c.card.showRef).filter(Boolean))]);

  const ranked = cands
    .filter((c) => !blockedEps.has(c.card.ref) && !blockedShows.has(c.card.showRef))
    .map((c) => {
      const title = c.card.feedTitle || c.show?.title || "";
      const shelf = onShelf(title);
      const news = ctx.newsIds.has(c.e.feedId);
      const chart = ctx.chart.has(String(c.show?.itunesId || c.e.feedItunesId || ""));
      const showQ = q.shows.get(c.card.showRef);
      const big = (c.show?.episodeCount ?? 0) >= 40;
      const ok = c.linked || shelf || news || (big && (chart || wellLiked(showQ)));
      const score = (c.linked ? 8 : 0) + (shelf ? 5 : 0) + (news ? 2 : 0) + (chart ? 2 : 0) + listenScore(q.episodes.get(c.card.ref)) + listenScore(showQ) / 2 + 2 * (1 - c.order / 40);
      const flags = [c.linked && "linked by the news show", shelf && "trusted shelf", chart && "top 100 on Apple"].filter(Boolean);
      return { ...c, ok, score, flags };
    })
    .filter((c) => c.ok)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length && !pinned.length) return { deeper: [], why: `${pool.size} older episodes, none from a trusted, news or big show` };

  // One episode per show, then let Claude choose among the best.
  const seen = new Set();
  const top = ranked.filter((c) => !seen.has(c.e.feedId) && seen.add(c.e.feedId)).slice(0, TO_CLAUDE);
  const editor = top.length
    ? await claudeEditor({
        topic: g.topic,
        fresh: { id: fresh.id, title: fresh.title, show: fresh.show?.title || "", description: fresh.description },
        candidates: top.map((c) => ({
          id: String(c.e.id),
          title: c.e.title,
          show: c.card.feedTitle,
          date: c.e.datePublished,
          minutes: c.e.duration ? Math.round(c.e.duration / 60) : 0,
          description: plainText(c.e.description || "").slice(0, 400),
          flags: c.flags,
        })),
      })
    : null;
  const chosen = editor
    ? editor.picks.map((p) => ({ ...top.find((c) => String(c.e.id) === p.id).card, why: p.why }))
    : top.slice(0, 2).map((c) => c.card);
  const pinnedIds = new Set(pinned.map((c) => c.ref));
  const deeper = [...pinned, ...chosen.filter((c) => !pinnedIds.has(c.ref))].slice(0, 2);
  return { deeper, editor, why: deeper.length ? "" : "none chosen" };
}

async function build() {
  const week = await thisWeek();
  if (!week.episodes.length) throw new Error("No news episodes"); // not kept: try again next time
  const [trends, picks, chart] = await Promise.all([
    trendingTopics(25).then((t) => t.map((x) => x.topic)).catch(() => []),
    loadPicks(),
    chartItunesIds().catch(() => new Set()),
  ]);
  const groups = groupTopics(week.episodes, { trends, max: MAX_TOPICS * 2 });
  const ctx = { ...week, picks, chart, newsIds: new Set(week.shows.map((s) => s.id)), notes: [] };
  // A few stories at a time, in order, until there are enough: all at once sent hundreds of requests to Podcast Index
  // together, and a story whose requests fail is left out.
  const topics = [];
  for (let i = 0; i < groups.length && topics.length < MAX_TOPICS; i += 3) {
    const batch = await Promise.all(groups.slice(i, i + 3).map((g) => buildTopic(g, ctx).catch((err) => (note(ctx, g, `left out, error: ${err?.message || err}`), null))));
    topics.push(...batch.filter(Boolean));
  }
  topics.splice(MAX_TOPICS);
  // Stories with a Go deeper first, the rest after, each group in its order.
  topics.sort((a, b) => Number(!a.deeper.length) - Number(!b.deeper.length));
  const why = {
    newsShows: week.shows.map((s) => s.title),
    episodes: week.episodes.length,
    possibleStories: groups.map((g) => `${g.topic} (${g.shows} shows)`),
    notes: ctx.notes,
  };
  console.log(`news-explained: ${why.newsShows.length} news shows, ${why.episodes} episodes, ${groups.length} possible stories, ${topics.length} shown`);
  if (!topics.length) throw new Error("No stories");
  return { since: week.since, builtAt: Math.floor(Date.now() / 1000), topics, why };
}

// Made at most every 3 hours (news shows publish once or twice a day); a failed or empty try isn't kept.
const cached = unstable_cache(build, ["news-explained", "v4"], { revalidate: 3 * 3600 });

/** { since, builtAt, topics: [{ topic, key, summary, shows, fresh: card, deeper: [card (+ why)] }] }; topics is [] when
 *  nothing strong enough is found. */
export async function newsExplained() {
  try {
    return await cached();
  } catch {
    return { since: 0, builtAt: 0, topics: [] };
  }
}
