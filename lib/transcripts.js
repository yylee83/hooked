// Reads the transcripts that shows publish, and finds where a topic comes up.
import "server-only";
import { safeFetch } from "./safe-fetch";

const TIMED = ["application/json", "text/vtt", "application/x-subrip", "application/srt", "text/srt"];

// Which published transcript (if any) has timestamps we can cut on.
export function pickTranscript(ep) {
  const list = Array.isArray(ep?.transcripts) ? ep.transcripts : [];
  if (!list.length && ep?.transcriptUrl) list.push({ url: ep.transcriptUrl, type: guessType(ep.transcriptUrl) });
  const timed = list
    .map((t) => ({ ...t, type: (t.type || guessType(t.url)).toLowerCase() }))
    .filter((t) => t.url && TIMED.includes(t.type))
    .sort((a, b) => TIMED.indexOf(a.type) - TIMED.indexOf(b.type));
  if (timed.length) return { kind: "timed", ...timed[0] };
  return list.length ? { kind: "text" } : null;
}

function guessType(url = "") {
  const u = url.toLowerCase().split("?")[0];
  if (u.endsWith(".json")) return "application/json";
  if (u.endsWith(".vtt")) return "text/vtt";
  if (u.endsWith(".srt")) return "application/x-subrip";
  if (u.endsWith(".html") || u.endsWith(".htm")) return "text/html";
  return "text/plain";
}

// "01:02:03.456", "02:03,456" or "75.5" → seconds
function toSec(t) {
  const parts = String(t).trim().replace(",", ".").split(":").map(Number);
  if (parts.some((n) => Number.isNaN(n))) return NaN;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseTimed(body, type) {
  if (type === "application/json") {
    const json = typeof body === "string" ? JSON.parse(body) : body;
    return (json.segments || [])
      .map((s) => ({ start: Number(s.startTime), end: Number(s.endTime), text: String(s.body || "") }))
      .filter((c) => Number.isFinite(c.start) && c.text);
  }
  // VTT and SRT
  const cues = [];
  const lines = String(body).replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("-->")) continue;
    const [a, b] = lines[i].split("-->");
    const start = toSec(a);
    const end = toSec(b.trim().split(/\s+/)[0]);
    const text = [];
    while (i + 1 < lines.length && lines[i + 1].trim() !== "") text.push(lines[++i]);
    const clean = text.join(" ").replace(/<[^>]+>/g, "").trim();
    if (Number.isFinite(start) && clean) cues.push({ start, end: Number.isFinite(end) ? end : start + 4, text: clean });
  }
  return cues;
}

export async function fetchCues(t) {
  try {
    // The address comes from the podcast's feed, so it goes through safeFetch.
    const res = await safeFetch(t.url, { timeoutMs: 8000, maxBytes: 6_000_000, next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const body = res.body.toString("utf8");
    const cues = parseTimed(body, t.type);
    return cues.length ? cues : null;
  } catch {
    return null;
  }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "Kara Swisher" → matches "Kara Swisher" or "Swisher". "a|b" or "a, b" = alternatives.
export function topicPattern(topic) {
  const alts = new Set();
  for (const raw of topic.split(/[|,]/)) {
    const words = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const phrase = words.map((w, i) => (i === words.length - 1 ? escape(w.replace(/(es|s)$/, "")) + "(?:s|es)?" : escape(w))).join("\\s+");
    alts.add(phrase);
    const last = words[words.length - 1];
    if (words.length > 1 && last.length >= 5) alts.add(escape(last));
  }
  if (!alts.size) return null;
  return new RegExp(`\\b(?:${[...alts].join("|")})\\b`, "gi");
}

// Find the parts of a transcript about the topic, padded so each clip makes sense on its own.
export function findClips(cues, topic, duration, { before = 15, after = 75, joinGap = 30 } = {}) {
  const re = topicPattern(topic);
  if (!re || !cues?.length) return [];

  // One long string, so matches split across two captions are still found.
  let text = "";
  const at = []; // character offset → cue index
  cues.forEach((c, i) => {
    at.push([text.length, i]);
    text += c.text + " ";
  });
  const cueAt = (offset) => {
    let lo = 0, hi = at.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (at[mid][0] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return at[lo][1];
  };

  const hits = [];
  for (const m of text.matchAll(re)) hits.push(cueAt(m.index));
  if (!hits.length) return [];

  const max = duration || cues[cues.length - 1].end + after;
  const clips = [];
  for (const i of [...new Set(hits)].sort((a, b) => a - b)) {
    const c = cues[i];
    const start = Math.max(0, Math.floor(c.start - before));
    const end = Math.min(max, Math.ceil(c.end + after));
    const last = clips[clips.length - 1];
    if (last && start <= last.end + joinGap) {
      last.end = Math.max(last.end, end);
      last.mentions++;
    } else {
      clips.push({ start, end, mentions: 1, quote: c.text.slice(0, 180) });
    }
  }
  // If the whole episode is about it, just play the whole episode.
  const total = clips.reduce((s, c) => s + c.end - c.start, 0);
  if (duration && total > duration * 0.8) return [{ start: 0, end: duration, mentions: hits.length, quote: clips[0].quote, whole: true }];
  return clips;
}
