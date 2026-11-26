// Keeping Home's trending rows from opening on the same thing every visit (YY, 2026-11-26: "it's boring to constantly
// log on and see the same suggestions"). While Hooked is small, the activity behind "Trending episodes" and "Top
// conversations" barely moves from one day to the next, so a strict ranking always leads with the same card.
//
// freshOrder() keeps the ranking as the starting point, then:
//   1. Shuffles the top few lightly on every visit, weighted by score, so the busiest ones still lead most often.
//   2. Pushes down whatever led on this device in the last few visits (remembered in localStorage, one list per row).
//   3. Puts anything you've already logged (or your own review) at the end.
// The order is worked out once per visit and refresh, so cards don't jump around while you look at them.

const SEEN_DAYS = 3; // a lead counts as "just seen" for this long
const REMEMBER = 4; // how many recent leads to remember per row
const POOL = 6; // only the top few trade places; the rest stay in ranked order

const storeKey = (row) => `hooked:fresh:${row}`;

function readLeads(row) {
  try {
    const list = JSON.parse(localStorage.getItem(storeKey(row)) || "[]");
    const cutoff = Date.now() - SEEN_DAYS * 86400000;
    return Array.isArray(list) ? list.filter((x) => x && x.at > cutoff) : [];
  } catch {
    return [];
  }
}

/** Remember which card led this visit (call once the row is on screen). `visit` keeps one entry per visit. */
export function rememberLead(row, key, visit) {
  if (!key) return;
  try {
    const list = readLeads(row).filter((x) => x.visit !== visit);
    list.unshift({ key, visit, at: Date.now() });
    localStorage.setItem(storeKey(row), JSON.stringify(list.slice(0, REMEMBER)));
  } catch {
    // private window or blocked storage: just no memory between visits
  }
}

/** The cards that led recently on this device, newest first. Read once per visit. */
export const recentLeads = (row) => readLeads(row).map((x) => x.key);

/**
 * items: already in ranked order. key(item) → id; weight(item, i) → how strong it is (> 0).
 * done(item) → true for things you've logged or wrote. recent: keys from recentLeads(). luck(item) → 0..1, drawn once
 * per visit (withLuck) so the order holds still while the page re-renders.
 */
export function freshOrder(items, { key, weight, done = () => false, recent = [], luck = (it) => it.luck ?? 0.5 }) {
  const fresh = [];
  const last = [];
  items.forEach((it, i) => (done(it) ? last : fresh).push({ it, i }));
  const pool = fresh.slice(0, POOL);
  const rest = fresh.slice(POOL);
  const keyed = pool.map(({ it, i }) => {
    const k = key(it);
    const seen = recent.indexOf(k);
    // Led last visit: a tenth as likely to lead again; the visit before, a third; older, half.
    const damp = seen === 0 ? 0.1 : seen === 1 ? 0.33 : seen > 1 ? 0.5 : 1;
    // Square root: a card twice as busy leads more often, not every time.
    const w = Math.max(0.0001, Math.sqrt(Math.max(0, weight(it, i))) * damp);
    // Weighted shuffle: each card draws a number, stronger cards draw higher on average.
    return { it, draw: Math.pow(Math.max(1e-9, luck(it)), 1 / w) };
  });
  keyed.sort((a, b) => b.draw - a.draw);
  return [...keyed.map((x) => x.it), ...rest.map((x) => x.it), ...last.map((x) => x.it)];
}

/** Give each item its draw for this visit, when it's loaded. */
export const withLuck = (items) => items.map((it) => ({ ...it, luck: Math.random() }));
