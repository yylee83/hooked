// Finding the week's news topics from news podcasts' own episodes (Search's "In the news, explained",
// lib/news-explained.js). No outside calls here, so it can be tested on its own (scripts/check-news-topics.mjs).
//
// A topic is a name (a place, a person, an event: "Venezuela", "Strait of Hormuz", "Zohran Mamdani") that at least
// two different news shows mention in this week's episodes. Words in nearly every episode ("Trump") say nothing
// about what an episode is about, so they're left out, and so are hosts' names (they only appear on one show).

// Capitalized words that aren't topics on their own.
const COMMON = new Set(
  (
    "a an and are as at be but by can do for from has have he her his how i if in is it its just may me more my new no not now of " +
    "on one or our out over she so that the their them then there these they this those to up us was we what when where which who " +
    "why will with you your after again all also amid another any around back because before being between both could day days " +
    "did does down each even every first get gets go going good got had here into last left like long made make many most much " +
    "never next off old only other own people plus really right said say says see should since some still such take than then " +
    "through time too two under until very want way week well were while whole would year years yes yet today tonight tomorrow " +
    "yesterday morning evening weekend episode episodes podcast podcasts show shows listen listener listeners subscribe " +
    "subscription subscriptions guest guests host hosts hosted producer producers produced edited editor editors support " +
    "sponsor sponsors ad ads free full access unlock learn read follow join find sign email newsletter link links click visit " +
    "special update updates part interview conversation story stories news inside behind explained explainer breaking latest " +
    "live recap preview question questions answer answers big little real true why's what's here's there's it's that's let's " +
    "president presidents mr mrs ms dr sen rep gov secretary officials official administration government state states " +
    "federal national international world country countries city american americans america's us u.s usa u.s.a united " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april june july august september " +
    "october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
    "republican republicans democrat democrats democratic gop party white house congress senate court supreme " +
    "photo photos credit credits getty images reuters ap associated press"
  ).split(/\s+/)
);

// Names that cover too much to be a topic, whoever mentions them.
const TOO_BROAD = new Set([
  "trump", "donald trump", "president trump", "donald j trump", "biden", "joe biden", "america", "united states",
  "washington", "new york times", "the new york times", "npr", "bbc", "cnn", "fox", "fox news", "wall street journal",
  "washington post", "the economist", "economist", "vox", "slate", "cbc", "apple news", "apple", "spotify", "youtube",
  "white house", "congress", "senate", "house", "supreme court", "pentagon", "europe", "china", "earth",
]);

const norm = (s = "") =>
  String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Words joined inside a name: "Strait of Hormuz", "Bank of England", "Gulf of America".
const JOINERS = new Set(["of", "de", "al", "el", "la", "bin"]);

const capitalized = (w) => /^[A-Z][\p{L}\p{N}'’.-]*$/u.test(w) || /^[A-Z0-9]{2,}$/.test(w);

/** The names in a piece of text: runs of capitalized words, without sentence-starting filler. */
export function namesIn(text = "") {
  const out = [];
  // Split into sentences and clauses, so a name never runs across a full stop or a colon.
  for (const part of String(text).split(/[.!?:;|()\[\]"“”—–]+|\s-\s|,/)) {
    const toks = part.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""));
    let run = [];
    const flush = () => {
      while (run.length && (JOINERS.has(run[run.length - 1].toLowerCase()) || COMMON.has(run[run.length - 1].toLowerCase()))) run.pop();
      while (run.length && (JOINERS.has(run[0].toLowerCase()) || COMMON.has(run[0].toLowerCase()))) run.shift();
      if (run.length && run.length <= 4) {
        const name = run.join(" ").replace(/[’']s$/, "");
        if (name.length >= 3 && !/^\d+$/.test(name)) out.push(name);
      }
      run = [];
    };
    for (const t of toks) {
      if (!t) continue;
      if (capitalized(t) && !COMMON.has(t.toLowerCase())) run.push(t);
      else if (run.length && JOINERS.has(t.toLowerCase())) run.push(t);
      else flush();
    }
    flush();
  }
  return out;
}

const contains = (hay, needle) => ` ${hay} `.includes(` ${needle} `);

/** Does this text talk about this topic (whole words)? */
export const mentions = (text, topic) => contains(norm(text), norm(topic));

/**
 * Group the week's news episodes into topics, most covered first.
 * episodes: [{ id, feedId, title, description, date }] (description as plain text).
 * Returns [{ topic, key, shows: number, episodes: [episode…] }], each episode in at most one topic.
 */
export function groupTopics(episodes, { trends = [], max = 8 } = {}) {
  const found = new Map(); // key → { names: Map(name → count), eps: Set, shows: Set, inTitle: number }
  for (const e of episodes) {
    const title = e.title || "";
    const text = `${title}. ${(e.description || "").slice(0, 500)}`;
    const keys = new Set();
    for (const name of namesIn(text)) {
      const key = norm(name);
      if (!key || TOO_BROAD.has(key) || keys.has(key)) continue;
      keys.add(key);
      if (!found.has(key)) found.set(key, { names: new Map(), eps: new Set(), shows: new Set(), inTitle: 0 });
      const f = found.get(key);
      f.names.set(name, (f.names.get(name) || 0) + 1);
      f.eps.add(e);
      f.shows.add(e.feedId);
      if (contains(norm(title), key)) f.inTitle++;
    }
  }

  // A name in most episodes is background noise, not a topic.
  const tooCommon = Math.max(4, episodes.length * 0.3);
  const cands = [...found.entries()]
    .filter(([, f]) => f.eps.size <= tooCommon)
    .map(([key, f]) => ({
      key,
      topic: [...f.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      eps: f.eps,
      shows: f.shows,
      inTitle: f.inTitle,
      own: f.eps.size,
    }));

  // "Hormuz" and "Strait of Hormuz" are one topic: fold names inside other names together.
  cands.sort((a, b) => b.key.length - a.key.length);
  const kept = [];
  for (const c of cands) {
    const into = kept.find((k) => contains(k.key, c.key) || contains(c.key, k.key));
    if (!into) {
      kept.push(c);
      continue;
    }
    // The name used for most episodes wins ("Venezuela" over "Venezuela's Election"); on a tie, the longer one.
    if (c.eps.size > into.own) {
      into.topic = c.topic;
      into.key = c.key;
      into.own = c.eps.size;
    }
    for (const e of c.eps) into.eps.add(e);
    for (const s of c.shows) into.shows.add(s);
    into.inTitle += c.inTitle;
  }
  // A topic needs two shows, and at least one episode about it by name.
  const strong = kept.filter((c) => c.shows.size >= 2 && c.inTitle >= 1);

  const trendKeys = trends.map((t) => norm(t)).filter(Boolean);
  const newest = (c) => Math.max(...[...c.eps].map((e) => e.date || 0));
  const score = (c) =>
    c.shows.size * 3 + c.eps.size + c.inTitle * 2 + (trendKeys.some((t) => contains(t, c.key) || contains(c.key, t)) ? 3 : 0) + c.key.split(" ").length * 0.5;
  strong.sort((a, b) => score(b) - score(a) || newest(b) - newest(a));

  // Each episode belongs to one topic, and a topic whose episodes are mostly taken already ("Iran" after
  // "Strait of Hormuz") is the same story: skip it.
  const used = new Set();
  const out = [];
  for (const c of strong) {
    const eps = [...c.eps];
    const free = eps.filter((e) => !used.has(e));
    if (free.length < eps.length / 2 || new Set(free.map((e) => e.feedId)).size < 2) continue;
    free.forEach((e) => used.add(e));
    out.push({
      topic: c.topic,
      key: c.key,
      shows: new Set(free.map((e) => e.feedId)).size,
      episodes: free.sort((a, b) => Number(contains(norm(b.title), c.key)) - Number(contains(norm(a.title), c.key)) || (b.date || 0) - (a.date || 0)),
    });
    if (out.length >= max) break;
  }
  return out;
}
