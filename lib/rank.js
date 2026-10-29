// Search relevance: put results that contain the exact phrase first, and drop loose
// matches (e.g. "Marty" in one place and "Supreme" in another) when better ones exist.

const STOP = new Set(["a", "an", "the", "of", "and", "or", "to", "in", "on", "for", "with", "at", "by", "is"]);

export function norm(s = "") {
  return String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(q) {
  const all = norm(q).split(" ").filter(Boolean);
  const meaningful = all.filter((w) => !STOP.has(w));
  return meaningful.length ? meaningful : all;
}

const has = (hay, needle) => ` ${hay} `.includes(` ${needle} `);

// All the words appear close together (within a few words of each other) somewhere in this text.
function near(text, ws, slack = 4) {
  const toks = text.split(" ");
  const want = new Set(ws);
  const span = ws.length + slack;
  for (let i = 0; i < toks.length; i++) {
    if (!want.has(toks[i])) continue;
    const seen = new Set();
    for (let j = i; j < Math.min(toks.length, i + span); j++) if (want.has(toks[j])) seen.add(toks[j]);
    if (seen.size === want.size) return true;
  }
  return false;
}

// fields: [{ text, weight }]; weight ~3 for titles, ~1 for descriptions.
export function relevance(query, fields) {
  const phrase = norm(query);
  const ws = words(query);
  if (!phrase || !ws.length) return 0;
  let score = 0;
  let allWordsSomewhere = false;
  let close = false;
  const joined = fields.map((f) => norm(f.text)).join(" ");
  for (const f of fields) {
    const t = norm(f.text);
    if (!t) continue;
    if (ws.length > 1 && has(t, phrase)) score += 100 * f.weight;
    else if (ws.length === 1 && has(t, ws[0])) score += 40 * f.weight;
    if (near(t, ws)) close = true;
    const found = ws.filter((w) => has(t, w)).length;
    if (found === ws.length) score += 20 * f.weight;
    else score += (found / ws.length) * 4 * f.weight;
  }
  if (ws.every((w) => has(joined, w))) allWordsSomewhere = true;
  const phraseHit = ws.length > 1 ? has(joined, phrase) : allWordsSomewhere;
  return { score, phraseHit, allWords: allWordsSomewhere, close: phraseHit || close };
}

// Rank a list. A result only counts if the query's words show up together (the exact phrase,
// or all the words within a few words of each other). Loose matches are dropped, even if
// that leaves nothing: an empty list beats a page of unrelated results.
// boost(item) adds extra points (popularity, recency, exact title).
export function rankResults(query, items, fieldsOf, tiebreak = () => 0, boost = () => 0) {
  const scored = items.map((item) => ({ item, ...relevance(query, fieldsOf(item)) }));
  const pool = scored.filter((s) => s.close);
  for (const s of pool) s.score += boost(s.item) + (s.phraseHit ? 30 : 0);
  return pool.sort((a, b) => b.score - a.score || tiebreak(b.item) - tiebreak(a.item)).map((s) => s.item);
}

// The title is exactly the query, ignoring "the" and punctuation ("the daily" = "The Daily").
export function exactTitle(query, title) {
  const strip = (x) => norm(x).replace(/^the /, "");
  return !!title && strip(title) === strip(query);
}

export const episodeFields = (e) => [
  { text: e.title, weight: 3 },
  { text: e.feedTitle, weight: 1.5 },
  { text: (e.description || "").slice(0, 4000), weight: 1 },
];

export const showFields = (s) => [
  { text: s.title, weight: 3 },
  { text: s.author || s.ownerName, weight: 2 },
  { text: (s.description || "").slice(0, 2000), weight: 1 },
];
