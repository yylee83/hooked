const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(unixSeconds) {
  if (!unixSeconds) return "";
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

export function minutes(seconds) {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} hr ${m % 60} min`;
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Decision 6: stars rate episodes, "hooked" is for shows. How a log reads in feeds: "@erin rated …" when it has stars,
// "@erin logged …" when it doesn't.
export const logVerb = (log) => (Number(log?.rating) > 0 ? "rated" : "logged");

/** Average stars of the logs that have them, to one decimal ({ avg, count }; avg is 0 when none are rated). */
export function starStats(logs = []) {
  const rated = logs.map((l) => Number(l.rating)).filter((r) => r > 0);
  return { avg: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : 0, count: rated.length };
}
