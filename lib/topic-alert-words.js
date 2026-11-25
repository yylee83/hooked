// How a bundled "Follow topic" alert is stored and shown (no server code here, so the bell can use it too).
// A 'topic' notification: title = the topic, body = "<count>|<since>|<until>" (unix seconds). See lib/topic-alerts.js.

export const alertBody = (count, since, until) => `${count}|${Math.floor(since)}|${Math.floor(until)}`;

// A topic alert's parts, and the page that lists its episodes.
export function readAlert(n) {
  const [count, since, until] = String(n.body || "").split("|").map(Number);
  const topic = n.title || "";
  const p = new URLSearchParams({ q: topic });
  if (since) p.set("since", String(since));
  if (until) p.set("until", String(until));
  return {
    topic,
    count: count || 1,
    words: `${count > 1 ? count : "A"} new episode${count > 1 ? "s" : ""} about ${topic}`,
    href: `/search/topic?${p}`,
  };
}
