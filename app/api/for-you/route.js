// "For you" on Home: episodes picked from what you're hooked on, what friends loved,
// and the top shows in the topics you chose. Every pick says why it's there.
// Shows and episodes are ours (short ids); Podcast Index is only asked for the newest episodes of
// shows it serves. Shows from their own feed use the episodes we saved. Spotify-only episodes can't
// play here, so they're left out.
import { episodeCard, getEpisodes, safe } from "@/lib/podcastindex";
import { popularOnHooked, topCharts } from "@/lib/charts";
import { publicDb } from "@/lib/supabase/public";
import { REF, ownShowEpisodes, withRefs } from "@/lib/catalog";
import { genreLabel } from "@/lib/genres";

const PI_ID = /^\d{1,15}$/;
// Our short ids or Podcast Index numbers, as strings.
const keys = (a, max) => [...new Set((Array.isArray(a) ? a : []).map(String).filter((x) => REF.test(x) || PI_ID.test(x)))].slice(0, max);
const uuids = (a, max) => (Array.isArray(a) ? a : []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, max);
// One show, whichever id we know it by: the Podcast Index number when it has one, else ours.
const showKeyOf = (c) => (c.feedId ? `f${c.feedId}` : c.showRef ? `r${c.showRef}` : "");

// Our show rows for a list of ids (ours or Podcast Index numbers), looked up by either.
async function showRows(db, list) {
  const refs = list.filter((x) => REF.test(x));
  const nums = list.filter((x) => PI_ID.test(x));
  const cols = "id, podcastindex_id, source, title, image_url";
  const [a, b] = await Promise.all([
    refs.length ? db.from("shows").select(cols).in("id", refs) : { data: [] },
    nums.length ? db.from("shows").select(cols).in("podcastindex_id", nums) : { data: [] },
  ]);
  const map = new Map();
  for (const r of [...(a.data || []), ...(b.data || [])]) {
    map.set(r.id, r);
    if (r.podcastindex_id) map.set(String(r.podcastindex_id), r);
  }
  return map;
}

export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {}
  // [[showId, reason], ...] in priority order: hooked-on shows first, then your top-rated.
  const lovedPairs = (Array.isArray(body.loved) ? body.loved : []).filter((p) => Array.isArray(p) && keys([p[0]], 1).length);
  const loved = Object.fromEntries(lovedPairs.map(([id, r]) => [String(id), String(r || "").slice(0, 60)]));
  const lovedIds = [...new Set(lovedPairs.map(([id]) => String(id)))].slice(0, 6);
  // Episodes you've logged and shows you know, by both our ids and Podcast Index numbers.
  const logged = new Set(keys(body.logged, 2000));
  const knownShows = new Set(keys(body.shows, 2000));
  const genres = (Array.isArray(body.genres) ? body.genres : []).map(String).slice(0, 12);
  const friends = uuids(body.friends, 200);
  const db = publicDb();

  const isLogged = (c) => (c.id != null && logged.has(String(c.id))) || (c.ref && logged.has(c.ref));
  const isKnownShow = (s) => (s.feedId && knownShows.has(String(s.feedId))) || (s.showRef && knownShows.has(s.showRef));
  const seenEp = new Set();
  const seenShow = new Set();
  const take = (card, reason, kind) => {
    if (!card || !card.audio || isLogged(card)) return null;
    const ek = card.ref || `p${card.id}`;
    const sk = showKeyOf(card);
    if (seenEp.has(ek) || (sk && seenShow.has(sk))) return null;
    seenEp.add(ek);
    if (sk) seenShow.add(sk);
    return { ...card, reason, kind };
  };

  // The newest episodes of one show: from Podcast Index when it serves the show, otherwise (or if
  // Podcast Index doesn't answer) the episodes we saved from the show's own feed.
  // Podcast Index's episode list leaves out the show's name, so we pass in the one we know.
  const newestOf = async (row, piId, max, known = {}) => {
    if (piId) {
      const { data } = await safe(getEpisodes(piId, max));
      const show = { id: piId, title: row?.title || known.title, image: row?.image_url || known.image, ...(row ? { ref: row.id } : {}) };
      if (data?.length) return withRefs(data.map((e) => episodeCard(e, show)));
    }
    if (!row || row.source === "spotify") return [];
    return (await ownShowEpisodes(row.id, max)).map((e) => episodeCard(e));
  };

  // 1) New from shows you love.
  const rows = db && lovedIds.length ? await showRows(db, lovedIds) : new Map();
  const fromLoved = (
    await Promise.all(
      lovedIds.map(async (id) => {
        const row = rows.get(id);
        const piId = row?.podcastindex_id || (PI_ID.test(id) ? id : null);
        const eps = await newestOf(row, piId, 4);
        const e = eps.find((c) => c.audio && !isLogged(c));
        return e ? [e, loved[id]] : null;
      })
    )
  ).filter(Boolean);

  // 2) What friends loved lately. Episode details come from our tables, not from the log.
  let fromFriends = [];
  if (db && friends.length) {
    const since = new Date(Date.now() - 45 * 864e5).toISOString();
    const { data } = await db
      .from("logs")
      .select(
        "rating, hooked, who:profiles!logs_user_id_fkey(handle), " +
          "episode:episodes!logs_episode_ref_fkey(id, podcastindex_id, title, image_url, audio_url, duration_seconds, published_at, show:shows(id, podcastindex_id, title, image_url))"
      )
      .in("user_id", friends)
      .gte("logged_at", since)
      .order("rating", { ascending: false, nullsFirst: false })
      .order("logged_at", { ascending: false })
      .limit(40);
    fromFriends = (data || [])
      .filter((l) => l.episode && l.hooked && (l.rating >= 4 || !l.rating))
      .map((l) => {
        const e = l.episode;
        const card = {
          id: e.podcastindex_id ?? undefined,
          ref: e.id,
          title: e.title,
          feedId: e.show?.podcastindex_id ?? undefined,
          showRef: e.show?.id,
          feedTitle: e.show?.title || "",
          image: e.image_url || e.show?.image_url || "",
          feedImage: e.show?.image_url || "",
          audio: e.audio_url || "",
          duration: e.duration_seconds || 0,
          date: e.published_at ? Math.floor(new Date(e.published_at).getTime() / 1000) : 0,
        };
        return [card, l.rating ? `@${l.who?.handle} gave it ${l.rating}★` : `@${l.who?.handle} is hooked`];
      });
  }

  // 3) Top shows in your topics you haven't tried. (Apple's chart; we look them up in Podcast Index.)
  const chart = (await topCharts(50)).filter((s) => s.feedId && !isKnownShow(s));
  const inTopics = genres.length ? chart.filter((s) => genres.includes(s.genreKey)) : [];
  const fromTopics = (
    await Promise.all(
      inTopics.slice(0, 5).map(async (s) => {
        const { data } = await safe(getEpisodes(s.feedId, 1));
        return data?.[0] ? [episodeCard(data[0], { id: s.feedId, title: s.title, image: s.image }), `#${s.rank} in ${genreLabel(s.genreKey)}`] : null;
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

  // 4) Not much to go on yet? Fill with what's popular here (any show, including ones from their own feed).
  if (picks.length < 4) {
    const pop = (await popularOnHooked(30, 8)).filter((s) => (s.feedId || s.showRef) && !isKnownShow(s));
    const popRows = db ? await showRows(db, pop.map((s) => s.showRef).filter(Boolean)) : new Map();
    for (const s of pop.slice(0, 4)) {
      const eps = await newestOf(popRows.get(s.showRef), s.feedId, 1, s);
      const x = take(eps[0], "Popular on Hooked", "popular");
      if (x) picks.push(x);
    }
  }

  return Response.json({ picks: await withRefs(picks.slice(0, 10)) }); // our short ids, for links
}
