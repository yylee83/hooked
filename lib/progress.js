// Remembers where you are in each episode, on this device, so leaving the site
// (or Safari reloading the page) doesn't lose your place. When you're signed in, every change is
// also sent to your account (lib/progress-sync.js), so another device can pick up where you left off.
//
// Two things are saved in localStorage:
//   hooked:progress  { [episode key]: { t: seconds in, d: length, at: when saved } }
//                    keyed by our short id (older entries by the Podcast Index number)
//   hooked:last      the episode that was in the player (so it comes back after a reload) and `at`,
//                    when that last changed. A closed player is saved as just { at }.

const PROGRESS = "hooked:progress";
const LAST = "hooked:last";
const KEEP = 200; // remember at most this many episodes
const MIN_RESUME = 10; // under 10 seconds in, just start from the top
const END_MARGIN = 60; // within a minute of the end counts as finished (and asks "Log it?": lib/finished.js)
const REWIND = 5; // pick up a few seconds early, to catch the end of the last sentence

// lib/progress-sync.js listens here for changes to send to your account.
let onChange = null;
export function onProgressChange(fn) {
  onChange = fn;
}
const changed = (what) => {
  try {
    onChange?.(what);
  } catch {}
};

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Is this position worth resuming from? Not right at the start or the very end.
export function resumable(t, d) {
  if (!(t >= MIN_RESUME)) return false;
  if (d > 0 && t >= d - END_MARGIN) return false;
  return true;
}

// Where an episode's spot is saved: our short id, or the Podcast Index number. Saves move an older
// number-keyed spot over to the short id.
const keysOf = (ep) => [ep?.ref, ep?.id].filter((k) => k != null && k !== "").map(String);

// Where to start an episode: a few seconds before your saved spot, or 0.
export function resumeAt(ep) {
  const all = read(PROGRESS, {});
  const p = keysOf(ep).map((k) => all[k]).find(Boolean);
  return p && resumable(p.t, p.d) ? Math.max(0, p.t - REWIND) : 0;
}

// Every saved spot, for syncing: { [episode key]: { t, d, at } }.
export const allSpots = () => read(PROGRESS, {});

// Spots from your account, kept where they're newer than this device's. Doesn't send anything back.
// rows: [{ key, t, d, at }]
export function mergeSpots(rows) {
  const all = read(PROGRESS, {});
  for (const r of rows) {
    if (all[r.key] && all[r.key].at >= r.at) continue;
    if (resumable(r.t, r.d)) all[r.key] = { t: Math.floor(r.t), d: Math.floor(r.d || 0), at: r.at };
    else delete all[r.key];
  }
  write(PROGRESS, trim(all));
}

function trim(all) {
  // Keep only the most recent ones so this never grows without limit.
  const ids = Object.keys(all);
  if (ids.length > KEEP) {
    ids.sort((a, b) => all[b].at - all[a].at);
    for (const id of ids.slice(KEEP)) delete all[id];
  }
  return all;
}

export function saveProgress(ep, t, d) {
  const [key, ...older] = keysOf(ep);
  if (!key || !(t >= 0)) return;
  const all = read(PROGRESS, {});
  // Nothing moved (say, leaving the page while paused): not new listening, so don't count it as newer.
  const had = all[key];
  if (!older.some((k) => all[k]) && (had ? Math.abs(had.t - Math.floor(t)) < 1 : !resumable(t, d))) return;
  for (const k of older) delete all[k];
  const at = Date.now();
  if (!resumable(t, d)) delete all[key];
  else all[key] = { t: Math.floor(t), d: Math.floor(d || 0), at };
  write(PROGRESS, trim(all));
  // Listening to the episode in the player keeps it the newest thing this device did.
  const last = read(LAST, null);
  if (last?.audio && keysOf(last).includes(key)) write(LAST, { ...last, at });
  changed({ key, t: resumable(t, d) ? Math.floor(t) : 0, d: Math.floor(d || 0), at });
}

// Finished: forget the spot, so next time it starts from the top.
export function clearProgress(ep) {
  const keys = keysOf(ep);
  if (!keys.length) return;
  const all = read(PROGRESS, {});
  for (const k of keys) delete all[k];
  write(PROGRESS, all);
  changed({ key: keys[0], t: 0, d: Math.floor(ep.duration || 0), at: Date.now() });
}

// Only the fields the player needs to show and play the episode again.
const slim = (ep) => ({
  id: ep.id,
  ref: ep.ref,
  showRef: ep.showRef,
  title: ep.title,
  feedTitle: ep.feedTitle,
  feedId: ep.feedId,
  image: ep.image,
  feedImage: ep.feedImage,
  audio: ep.audio,
  duration: ep.duration,
});

export function saveLast(ep) {
  const at = Date.now();
  if (!ep?.audio) return clearLast();
  write(LAST, { ...slim(ep), at });
  changed({ last: true, key: keysOf(ep)[0], at });
}

export function loadLast() {
  const ep = read(LAST, null);
  return ep?.audio ? ep : null;
}

// When the player last changed on this device (0 if never).
export const lastAt = () => read(LAST, null)?.at || 0;

export function clearLast() {
  const at = Date.now();
  write(LAST, { at });
  changed({ cleared: true, at });
}

// The player as your account says it is: an episode (or nothing), as of `at`. Doesn't send anything back.
export function setLastFrom(ep, at) {
  write(LAST, ep?.audio ? { ...slim(ep), at } : { at });
}

export { keysOf };
