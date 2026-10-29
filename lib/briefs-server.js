// Turns a topic into brief-ready episodes, with clips where a published transcript allows it.
import "server-only";
import { artOf, findEpisode, findShow, getEpisode, safe, searchEpisodes } from "./podcastindex";
import { fetchCues, findClips, pickTranscript } from "./transcripts";

function toItem(ep) {
  return {
    episodeId: ep.id,
    feedId: ep.feedId,
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
  const found = await searchEpisodes(topic, 40);
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
