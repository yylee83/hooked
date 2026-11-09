// Turns a topic into brief-ready episodes, with clips where a published transcript allows it.
import "server-only";
import { unstable_cache } from "next/cache";
import { briefSeconds } from "./clips";
import { getBrief } from "./briefs";
import { artOf, findEpisode, findShow, getEpisode, safe, searchEpisodes } from "./podcastindex";
import { fetchCues, findClips, pickTranscript } from "./transcripts";
import { loadEpisode, withRefs } from "./catalog";

export const SPOTIFY_ONLY = "This episode is only on Spotify, so it can't play in a brief.";

// One brief item. episodeRef/showRef are our ids; episodeId/feedId are Podcast Index numbers, when it has them.
function toItem(ep) {
  return {
    ...(ep.ref ? { episodeRef: ep.ref } : {}),
    ...(ep.showRef ? { showRef: ep.showRef } : {}),
    ...(ep.id != null ? { episodeId: ep.id } : {}),
    ...(ep.feedId != null ? { feedId: ep.feedId } : {}),
    show: ep.feedTitle || "",
    episode: ep.title,
    image: ep.image || ep.feedImage || "",
    audio: ep.enclosureUrl || "",
    duration: ep.duration || 0,
    date: ep.datePublished || 0,
  };
}

// Add clips to one episode, if it publishes a transcript with timestamps.
async function withClips(item, full, topic) {
  const t = pickTranscript(full);
  if (!t) return { ...item, transcript: "none", clips: null };
  if (t.kind !== "timed") return { ...item, transcript: "text", clips: null };
  const cues = await fetchCues(t);
  if (!cues) return { ...item, transcript: "unreadable", clips: null };
  const clips = findClips(cues, topic, item.duration);
  return { ...item, transcript: "timed", clips };
}

// For the brief builder: episodes that mention the topic.
export async function draftCandidates(topic, mode) {
  const found = await withRefs((await searchEpisodes(topic, 40)).filter((e) => !e.appleOnly)); // adds our ids where we have the episode
  const recent = found.slice(0, 24);
  if (mode !== "clips") return recent.map((e) => ({ ...toItem(e), transcript: null, clips: null }));

  // Look up each episode's transcript details, then read up to 14 timed transcripts.
  const full = await Promise.all(recent.map(async (e) => (await safe(getEpisode(e.id))).data || e));
  let reads = 0;
  const out = await Promise.all(
    full.map((e) => {
      const item = toItem(e);
      const t = pickTranscript(e);
      if (t?.kind === "timed" && reads < 14) {
        reads++;
        return withClips(item, e, topic);
      }
      return { ...item, transcript: t ? (t.kind === "timed" ? "skipped" : "text") : "none", clips: null };
    })
  );
  // Episodes with matching clips first (most mentions first), then the rest.
  const score = (x) => (x.clips?.length ? 1000 + x.clips.reduce((s, c) => s + c.mentions, 0) : 0);
  return out.sort((a, b) => score(b) - score(a) || b.date - a.date);
}

// One episode for a brief (e.g. added by pasting a link), with clips if the topic comes up.
// `key` is our episode id or a Podcast Index number. Returns { item } or { error }.
export async function briefItem(key, topic, mode) {
  const { data } = await loadEpisode(key);
  const e = data?.episode;
  if (!e) return { error: "We couldn't load that episode." };
  if (!e.enclosureUrl) return { error: data.show?.source === "spotify" ? SPOTIFY_ONLY : "We don't have audio for that episode, so it can't play in a brief." };
  const item = toItem({ ...e, feedTitle: e.feedTitle || data.show?.title || "", feedImage: e.feedImage || data.show?.image || "" });
  if (mode !== "clips" || !topic) return { item: { ...item, transcript: null, clips: null } };
  return { item: await withClips(item, e, topic) };
}

// For the hand-made briefs in lib/briefs.js: find each episode, and cut clips if possible.
export async function resolveCuratedItems(brief) {
  return Promise.all(
    brief.items.map(async (it) => {
      const { data: show } = await safe(findShow(it.show));
      const { data: ep } = show ? await safe(findEpisode(show.id, it.episode)) : { data: null };
      if (!ep) return { ...it, feedId: show?.id, image: artOf(show), clips: null, found: false };
      const { data: full } = await safe(getEpisode(ep.id));
      const base = { ...toItem({ ...ep, feedTitle: ep.feedTitle || show.title, feedImage: ep.feedImage || artOf(show) }), show: it.show, episode: it.episode };
      const withTopic = brief.topic ? await withClips(base, full || ep, brief.topic) : { ...base, clips: null };
      return { ...it, ...withTopic, found: true };
    })
  );
}

// A built-in brief's card details, worked out like its page does (only the episodes we found; "just the parts"
// counts only the clips). Reading transcripts is slow, so this is kept for 6 hours.
export const curatedSummary = unstable_cache(
  async (slug) => {
    const brief = getBrief(slug);
    if (!brief) return null;
    const items = await resolveCuratedItems(brief);
    const usable = items.filter((it) => it.found !== false);
    // Nothing found (e.g. Podcast Index didn't answer): don't keep that for 6 hours; the next visit tries again.
    if (!usable.length) throw new Error(`No episodes found for brief ${slug}`);
    return {
      shows: usable.length,
      seconds: Math.round(briefSeconds(usable, brief.mode || "clips")),
      covers: items.map((it) => it.image).filter(Boolean).slice(0, 3),
    };
  },
  ["curated-brief-summary"],
  { revalidate: 21600 }
);
