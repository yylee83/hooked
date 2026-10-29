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

// fields: [{ text, weight }]; weight ~3 for titles, ~1 for descriptions.
export function relevance(query, fields) {
  const phrase = norm(query);
  const ws = words(query);
  if (!phrase || !ws.length) return 0;
  let score = 0;
  let allWordsSomewhere = false;
  const joined = fields.map((f) => norm(f.text)).join(" ");
  for (const f of fields) {
    const t = norm(f.text);
    if (!t) continue;
    if (ws.length > 1 && has(t, phrase)) score += 100 * f.weight;
    else if (ws.length === 1 && has(t, ws[0])) score += 40 * f.weight;
    const found = ws.filter((w) => has(t, w)).length;
    if (found === ws.length) score += 20 * f.weight;
    else score += (found / ws.length) * 4 * f.weight;
  }
  if (ws.every((w) => has(joined, w))) allWordsSomewhere = true;
  return { score, phraseHit: ws.length > 1 ? has(joined, phrase) : allWordsSomewhere, allWords: allWordsSomewhere };
}

// Rank a list. Multi-word queries keep only phrase matches when there are any,
// otherwise only results with every word; single-word queries just sort.
export function rankResults(query, items, fieldsOf, tiebreak = () => 0) {
  const scored = items.map((item) => ({ item, ...relevance(query, fieldsOf(item)) }));
  const multi = words(query).length > 1;
  let pool = scored;
  if (multi) {
    const phrase = scored.filter((s) => s.phraseHit);
    const all = scored.filter((s) => s.allWords);
    pool = phrase.length ? phrase : all.length ? all : scored;
  }
  return pool.sort((a, b) => b.score - a.score || tiebreak(b.item) - tiebreak(a.item)).map((s) => s.item);
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
