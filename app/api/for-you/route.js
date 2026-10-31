// "For you" on Home: episodes picked from what you're hooked on, what friends loved,
// and the top shows in the topics you chose. Every pick says why it's there.
import { episodeCard, getEpisodes, safe } from "@/lib/podcastindex";
import { popularOnHooked, topCharts } from "@/lib/charts";
import { publicDb } from "@/lib/supabase/public";
import { genreLabel } from "@/lib/genres";

const ids = (a, max) => [...new Set((Array.isArray(a) ? a : []).map(String).filter((x) => /^\d+$/.test(x)))].slice(0, max);
const uuids = (a, max) => (Array.isArray(a) ? a : []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, max);

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {}
  // [[feedId, reason], ...] in priority order: hooked-on shows first, then your top-rated.
  const lovedPairs = (Array.isArray(body.loved) ? body.loved : []).filter((p) => Array.isArray(p) && /^\d+$/.test(String(p[0])));
  const loved = Object.fromEntries(lovedPairs.map(([id, r]) => [String(id), String(r || "").slice(0, 60)]));
  const lovedIds = [...new Set(lovedPairs.map(([id]) => String(id)))].slice(0, 6);
  const logged = new Set(ids(body.logged, 1000));
  const knownShows = new Set(ids(body.shows, 1000));
  const genres = (Array.isArray(body.genres) ? body.genres : []).map(String).slice(0, 12);
  const friends = uuids(body.friends, 200);

  const seenEp = new Set();
  const seenShow = new Set();
  const take = (e, reason, kind) => {
    if (!e || logged.has(String(e.id)) || seenEp.has(e.id) || seenShow.has(String(e.feedId))) return null;
    seenEp.add(e.id);
    seenShow.add(String(e.feedId));
    return { ...episodeCard(e), reason, kind };
  };

  // 1) New from shows you love.
  const fromLoved = (
    await Promise.all(
      lovedIds.map(async (id) => {
        const { data } = await safe(getEpisodes(id, 4));
        const e = (data || []).find((x) => !logged.has(String(x.id)));
        return e ? [e, loved[id]] : null;
      })
    )
  ).filter(Boolean);

  // 2) What friends loved lately.
  let fromFriends = [];
  const db = publicDb();
  if (db && friends.length) {
    const since = new Date(Date.now() - 45 * 864e5).toISOString();
    const { data } = await db
      .from("logs")
      .select("episode_id, title, feed_id, feed_title, image, feed_image, audio, duration, rating, hooked, who:profiles!logs_user_id_fkey(handle)")
      .in("user_id", friends)
      .gte("logged_at", since)
      .order("rating", { ascending: false, nullsFirst: false })
      .order("logged_at", { ascending: false })
      .limit(40);
    fromFriends = (data || [])
      .filter((l) => l.hooked && (l.rating >= 4 || !l.rating) && !logged.has(String(l.episode_id)))
      .map((l) => [
        { id: l.episode_id, title: l.title, feedId: l.feed_id, feedTitle: l.feed_title, image: l.image, feedImage: l.feed_image, enclosureUrl: l.audio, duration: l.duration },
        l.rating ? `@${l.who?.handle} gave it ${l.rating}★` : `@${l.who?.handle} is hooked`,
      ]);
  }

  // 3) Top shows in your topics you haven't tried.
  const chart = (await topCharts(50)).filter((s) => s.feedId && !knownShows.has(String(s.feedId)));
  const inTopics = genres.length ? chart.filter((s) => genres.includes(s.genreKey)) : [];
  const fromTopics = (
    await Promise.all(
      inTopics.slice(0, 5).map(async (s) => {
        const { data } = await safe(getEpisodes(s.feedId, 1));
        return data?.[0] ? [data[0], `#${s.rank} in ${genreLabel(s.genreKey)}`] : null;
      })
    )
  ).filter(Boolean);

  // Mix them: one from each pile in turn.
  const piles = [
    fromLoved.map(([e, r]) => [e, r, "loved"]),
    fromFriends.map(([e, r]) => [e, r, "friends"]),
    fromTopics.map(([e, r]) => [e, r, "topics"]),
  ];
  const picks = [];
  for (let round = 0; picks.length < 10 && piles.some((p) => p.length > round); round++) {
    for (const p of piles) if (p[round]) {
      const x = take(...p[round]);
      if (x) picks.push(x);
    }
  }

  // 4) Not much to go on yet? Fill with what's popular here.
  if (picks.length < 4) {
    const pop = (await popularOnHooked(30, 8)).filter((s) => !knownShows.has(String(s.feedId)));
    for (const s of pop.slice(0, 4)) {
      const { data } = await safe(getEpisodes(s.feedId, 1));
      const x = take(data?.[0], "Popular on Hooked", "popular");
      if (x) picks.push(x);
    }
  }

  return Response.json({ picks: picks.slice(0, 10) });
}
