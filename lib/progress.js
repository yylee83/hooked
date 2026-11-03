// Remembers where you are in each episode, on this device, so leaving the site
// (or Safari reloading the page) doesn't lose your place.
//
// Two things are saved in localStorage:
//   hooked:progress  { [episode key]: { t: seconds in, d: length, at: when saved } }
//                    keyed by our short id (older entries by the Podcast Index number)
//   hooked:last      the episode that was in the player, so it comes back after a reload

const PROGRESS = "hooked:progress";
const LAST = "hooked:last";
const KEEP = 200; // remember at most this many episodes
const MIN_RESUME = 10; // under 10 seconds in, just start from the top
const END_MARGIN = 30; // within 30 seconds of the end counts as finished

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

// Where to start an episode: your saved spot, or 0.
export function resumeAt(ep) {
  const all = read(PROGRESS, {});
  const p = keysOf(ep).map((k) => all[k]).find(Boolean);
  return p && resumable(p.t, p.d) ? p.t : 0;
}

export function saveProgress(ep, t, d) {
  const [key, ...older] = keysOf(ep);
  if (!key || !(t >= 0)) return;
  const all = read(PROGRESS, {});
  for (const k of older) delete all[k];
  if (!resumable(t, d)) delete all[key];
  else all[key] = { t: Math.floor(t), d: Math.floor(d || 0), at: Date.now() };
  // Keep only the most recent ones so this never grows without limit.
  const ids = Object.keys(all);
  if (ids.length > KEEP) {
    ids.sort((a, b) => all[b].at - all[a].at);
    for (const id of ids.slice(KEEP)) delete all[id];
  }
  write(PROGRESS, all);
}

// Finished: forget the spot, so next time it starts from the top.
export function clearProgress(ep) {
  const keys = keysOf(ep);
  if (!keys.length) return;
  const all = read(PROGRESS, {});
  for (const k of keys) delete all[k];
  write(PROGRESS, all);
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
  write(LAST, ep?.audio ? slim(ep) : null);
}

export function loadLast() {
  const ep = read(LAST, null);
  return ep?.audio ? ep : null;
}

export function clearLast() {
  write(LAST, null);
}
