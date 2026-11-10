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
    .replace(/[’']s\b/g, "") // "Mandela’s" counts as "mandela"
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

// fields: [{ text, weight, backup }]; weight ~3 for titles, ~1 for descriptions. A `backup` field (an
// episode's show name) only adds points when no field before it has all the words: an episode called
// "Nelson Mandela" on a show called "Nelson Mandela" shouldn't count twice.
export function relevance(query, fields) {
  const phrase = norm(query);
  const ws = words(query);
  if (!phrase || !ws.length) return 0;
  let score = 0;
  let allWordsSomewhere = false;
  let close = false;
  let matched = false;
  const joined = fields.map((f) => norm(f.text)).join(" ");
  for (const f of fields) {
    const t = norm(f.text);
    if (!t) continue;
    if (near(t, ws)) close = true;
    const found = ws.filter((w) => has(t, w)).length;
    if (f.backup && matched) continue;
    if (found === ws.length) matched = true;
    if (ws.length > 1 && has(t, phrase)) score += 100 * f.weight;
    else if (ws.length === 1 && has(t, ws[0])) score += 40 * f.weight;
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

// A show's name without the tagline after ":" or "|" ("Hit Parade | Music History and Music Trivia" → "Hit Parade").
export function showName(title = "") {
  return String(title).split(/\s*[|:]\s+|\s+\|\s*/)[0].trim() || String(title);
}

// The title (or the name before its tagline) is exactly the query, ignoring "the" and punctuation
// ("the daily" = "The Daily", "hit parade" = "Hit Parade | Music History and Music Trivia").
export function exactTitle(query, title) {
  const strip = (x) => norm(x).replace(/^the /, "");
  if (!title) return false;
  const q = strip(query);
  return strip(title) === q || strip(showName(title)) === q;
}

// Words that match a show by its name or host, not just somewhere in its description.
export const byName = (query, s) => relevance(query, [{ text: s.title, weight: 3 }, { text: s.author || s.ownerName, weight: 2 }]).close;

export const episodeFields = (e) => [
  { text: e.title, weight: 3 },
  { text: e.feedTitle, weight: 1.5, backup: true },
  { text: (e.description || "").slice(0, 4000), weight: 1 },
];

export const showFields = (s) => [
  { text: s.title, weight: 3 },
  { text: s.author || s.ownerName, weight: 2 },
  { text: (s.description || "").slice(0, 2000), weight: 1 },
];

// A show with only a handful of episodes (a school project called "Nelson Mandela") doesn't count as the
// show you meant just because its name is your search. Unknown counts (our own shows) still count.
export const MIN_EPISODES = 5;
export const substantial = (s) => s.episodeCount == null || s.episodeCount >= MIN_EPISODES;
export const namedShow = (query, s) => exactTitle(query, s.title) && substantial(s);

const YEAR = 365 * 86400;
const nowSec = () => Math.floor(Date.now() / 1000);
// Apple's top answers are usually the show people mean: #1 ≈ +450, #3 ≈ +300, #10 ≈ +75, #25 ≈ +3.
const appleShowBoost = (rank) => (rank ? Math.round(450 * 0.82 ** (rank - 1)) : 0);
// For episodes Apple's order matters too: #1 = +200, #3 ≈ +145, #10 ≈ +46, #20 ≈ +9.
const appleEpisodeBoost = (rank) => (rank ? Math.round(200 * 0.85 ** (rank - 1)) : 0);
// Most people here listen in English: other languages rank lower (but still show up).
const otherLanguage = (lang) => !!lang && !/^en\b|^en[-_]|^english/i.test(String(lang).trim());

// Shows, best first: exact name (of a real show), then relevance, popularity and whether it's still active.
export function rankShows(q, feeds, max) {
  const boost = (f) => {
    let b = 0;
    if (namedShow(q, f)) b += 300;
    // A show with only a few episodes goes below ones with some history. It still shows up, and comes
    // first when nothing else matches (a brand-new show).
    if (!substantial(f)) b -= 300;
    b += appleShowBoost(f.appleRank);
    b += Math.min(30, Math.log10((f.episodeCount || 0) + 1) * 10);
    const newest = f.newestItemPubdate || f.lastUpdateTime || 0;
    if (newest && nowSec() - newest > YEAR) b -= 60; // hasn't posted in a year
    if (otherLanguage(f.language)) b -= 200;
    return b;
  };
  let ranked = rankResults(q, feeds, showFields, (f) => f.episodeCount || 0, boost);
  // Matching only in the description ("Michelle Collins was our guest…") counts only when nothing
  // matches by name or host.
  if (ranked.some((f) => byName(q, f))) ranked = ranked.filter((f) => byName(q, f));
  // The same show listed twice (Podcast Index often has duplicate feeds): keep the better-ranked one.
  const names = new Set();
  ranked = ranked.filter((f) => {
    const k = `${norm(showName(f.title))}|${norm(f.author || f.ownerName || "")}`;
    return !names.has(k) && names.add(k);
  });
  return ranked.slice(0, max);
}

// Episodes, best first. Recent episodes and Apple's top answers get a nudge. Apple-only episodes don't
// count toward `max`: lib/search.js drops the ones we don't have, and they mustn't crowd out the rest.
export function rankEpisodes(q, items, max) {
  const boost = (e) => {
    const age = nowSec() - (e.datePublished || 0);
    return (age < 30 * 86400 ? 40 : age < YEAR ? 15 : 0) + appleEpisodeBoost(e.appleRank);
  };
  const out = [];
  let kept = 0;
  for (const e of rankResults(q, items, episodeFields, (e) => e.datePublished || 0, boost)) {
    if (kept >= max) break;
    out.push(e);
    if (!e.appleOnly) kept++;
  }
  return out;
}
