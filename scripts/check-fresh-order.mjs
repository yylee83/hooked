// Checks that Home's trending rows don't open on the same card every visit (lib/fresh-order.js, YY 2026-11-26).
// Run: node scripts/check-fresh-order.mjs
import assert from "node:assert/strict";
import { freshOrder, withLuck } from "../lib/fresh-order.js";

const items = [
  { id: "a", score: 6 },
  { id: "b", score: 3 },
  { id: "c", score: 2 },
  { id: "d", score: 1 },
  { id: "e", score: 1 },
  { id: "f", score: 0.5 },
  { id: "g", score: 0.4 },
  { id: "mine", score: 9 },
];
const opts = (recent) => ({ key: (x) => x.id, weight: (x) => x.score, done: (x) => x.id === "mine", recent });

// Ten visits in a row, each remembering what led before.
let recent = [];
const leads = [];
for (let v = 0; v < 10; v++) {
  const order = freshOrder(withLuck(items), opts(recent));
  assert.equal(order.length, items.length, "nothing lost");
  assert.equal(order.at(-1).id, "mine", "what you've logged goes last");
  assert.equal(order[6].id, "g", "past the top six, ranked order stays");
  leads.push(order[0].id);
  recent = [order[0].id, ...recent].slice(0, 4);
}
console.log("leads over 10 visits:", leads.join(" "));
let repeats = 0;
for (let i = 1; i < leads.length; i++) if (leads[i] === leads[i - 1]) repeats++;
assert.ok(repeats <= 3, "rarely the same lead twice in a row");
assert.ok(new Set(leads).size >= 3, "several different leads");

// Over many first visits, the busiest still leads most often.
const tally = {};
for (let i = 0; i < 4000; i++) {
  const k = freshOrder(withLuck(items), opts([]))[0].id;
  tally[k] = (tally[k] || 0) + 1;
}
console.log("first-visit leads:", tally);
assert.ok(tally.a > tally.b && tally.b > tally.d, "busier leads more often");

console.log("fresh order: all checks passed");
