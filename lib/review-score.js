// How valuable a review is, from what people did with it. Used to order reviews, in the browser and on the server.
// Older reactions, from before the change (until the database update converts them).
const LEGACY = { same: "agree", ooh: "agree", great: "agree" };

export function reviewScore({ reactions = [], comments = [], hook = "" } = {}) {
  const n = (k) => reactions.filter((r) => (LEGACY[r.kind] || r.kind) === k).length;
  // "Adding it" (made someone want to listen) counts most, then thumbs up, then replies.
  return n("adding") * 3 + n("agree") * 2 + n("disagree") + comments.length * 1.5 + (hook ? Math.min(2, hook.length / 80) : 0);
}
