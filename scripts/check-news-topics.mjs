// Checks how Search's "In the news, explained" groups a week of news episodes into topics (lib/news-topics.js).
// Run: node scripts/check-news-topics.mjs
import assert from "node:assert/strict";
import { groupTopics, namesIn, mentions } from "../lib/news-topics.js";

const now = 1_800_000_000;
let n = 0;
const ep = (feedId, title, description = "") => ({ id: ++n, feedId, title, description, date: now - n * 3600 });

// Names: capitalized runs, with "of" inside, without sentence-start filler or possessives.
assert.deepEqual(namesIn("Why the Strait of Hormuz matters"), ["Strait of Hormuz"]);
assert.deepEqual(namesIn("Venezuela's oil. Plus: Zohran Mamdani's first week"), ["Venezuela", "Zohran Mamdani"]);
assert.deepEqual(namesIn("Today on the show, how it happened."), []);
assert.ok(mentions("The fight over the Strait of Hormuz", "Strait of Hormuz"));
assert.ok(!mentions("Iranian drones", "Iran"));

const week = [
  ep(1, "The Strait of Hormuz, explained", "Iran threatened to close the Strait of Hormuz. Sean Rameswaram talks to a shipping expert."),
  ep(2, "Why Iran Is Squeezing the Strait of Hormuz", "Michael Barbaro talks to a reporter. Unlock full access to New York Times podcasts."),
  ep(9, "Hormuz, Venezuela, and a measles outbreak", "Trump says the US will respond. Leila Fadel and Steve Inskeep."),
  ep(2, "Inside Venezuela's Election", "Trump weighed in. Michael Barbaro hosts."),
  ep(3, "What happens to Venezuela now", "Trump and Maduro. Martine Powers hosts Post Reports."),
  ep(1, "The Louvre heist", "Sean Rameswaram on how thieves robbed the Louvre in seven minutes."),
  ep(4, "How thieves robbed the Louvre", "A WSJ reporter on the Louvre. Trump said nothing."),
  ep(5, "The shutdown deal", "Trump and Congress. Hosted by Mary Louise Kelly."),
  ep(6, "Trump's tariffs at the Supreme Court", "Trump. Supreme Court."),
];
const topics = groupTopics(week, { trends: ["louvre"], now });
const names = topics.map((t) => t.topic);
console.log(topics.map((t) => `${t.topic} (${t.shows} shows: ${t.episodes.map((e) => e.title).join(" / ")})`).join("\n"));

assert.ok(names.includes("Strait of Hormuz"), "Hormuz is a topic, under its full name");
assert.ok(names.includes("Venezuela"));
assert.ok(names.includes("Louvre"));
assert.ok(!names.some((t) => /trump|barbaro|rameswaram|supreme|congress/i.test(t)), "no hosts or too-broad names");
assert.ok(!names.includes("Iran"), "Iran is the same story as Hormuz here");
assert.equal(names[0], "Strait of Hormuz", "most covered first");
const all = topics.flatMap((t) => t.episodes.map((e) => e.id));
assert.equal(all.length, new Set(all).size, "each episode in one topic");
assert.ok(topics.every((t) => t.shows >= 2), "two shows or more");

// Fresh news wins (2026-11-26): six shows on a story five days ago lose to three shows on one this morning.
const at = (feedId, title, hoursAgo) => ({ id: ++n, feedId, title, description: "", date: now - hoursAgo * 3600 });
const days = [
  ...[1, 2, 3, 4, 5, 6].map((f) => at(f, `What Jensen Huang said`, 120 + f)),
  ...[1, 2, 3].map((f) => at(f, `The Louvre heist`, 2 + f)),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((f) => at(f, `Episode ${f} of something else`, 30 + f)),
];
const order = groupTopics(days, { now }).map((t) => t.topic);
assert.deepEqual(order.slice(0, 2), ["Louvre", "Jensen Huang"], "this morning's story before last week's");

// Rising beats played out (2026-11-26): a story five shows have covered every day for five days, now down to one
// show today, gives way to a new one three shows picked up in the last day.
const filler2 = Array.from({ length: 30 }, (_, i) => i + 1).map((f) => at(f, `Episode ${f} of other things`, 20 + f));
const worn = [
  ...[1, 2, 3, 4, 5].flatMap((f) => [at(f, "The Gaza ceasefire", 100 + f), at(f, "Gaza ceasefire talks", 50 + f)]),
  at(1, "Gaza ceasefire, day 5", 10),
];
const rising = [1, 2, 3].map((f) => at(f, "The Nvidia antitrust case", 4 + f * 3));
const ranked = groupTopics([...worn, ...rising, ...filler2], { now });
console.log(ranked.map((t) => `${t.topic}: ${t.score} ${JSON.stringify(t.parts)}`).join("\n"));
assert.equal(ranked[0].topic, "Nvidia", "the rising story leads");
assert.ok(ranked.some((t) => t.topic.startsWith("Gaza")), "the worn story is still a chip, just lower");

// Gone quiet: nothing for three days drops behind anything mentioned today, however big it was.
const quietBig = [1, 2, 3, 4, 5, 6].map((f) => at(f, "The Louvre heist", 80 + f));
const smallNow = [1, 2].map((f) => at(f, "The Venezuela vote", 2 + f));
const q = groupTopics([...quietBig, ...smallNow, ...filler2], { now });
assert.equal(q[0].topic, "Venezuela", "today's story first");
assert.ok(q[0].hot && !q.find((t) => t.topic === "Louvre").hot);

// Seasonal stories stay (YY, 2026-11-26), but a bare "Thanksgiving" is never a chip.
const parade = [1, 2, 3].map((f) => at(f, "Inside the Thanksgiving Day Parade", 3 + f));
const seasonal = groupTopics([...parade, ...filler2], { now }).map((t) => t.topic);
assert.ok(seasonal.some((t) => /parade/i.test(t)), "the parade is a chip");
assert.ok(!seasonal.includes("Thanksgiving"), "not just Thanksgiving");

// Short chips (YY, 2026-11-26): no headline fragments.
assert.equal(namesIn("Anthropic's IPO Didn't Stop the Selloff")[0], "Anthropic's IPO", "a contraction ends the name");
const ipo = [
  at(1, "Anthropic's IPO Didn't Stop the Selloff", 5),
  at(2, "Inside the Anthropic IPO", 6),
  at(3, "What Anthropic's IPO means for you", 7),
];
const chips = groupTopics([...ipo, ...filler2], { now }).map((t) => t.topic);
assert.ok(chips.some((t) => /^Anthropic/.test(t)), "an Anthropic chip");
assert.ok(chips.every((t) => t.split(" ").length <= 3 && t.length <= 24 && !/didn/i.test(t)), `short chips: ${chips}`);

// Whole phrases, no stray words (YY, 2026-11-28: chips said "Black" and "What").
assert.deepEqual(namesIn("What’s really behind Black Friday deals"), ["Black Friday"]);
assert.deepEqual(namesIn("Macy’s Thanksgiving Day Parade, explained"), ["Macy's Thanksgiving Day Parade"]);
assert.deepEqual(namesIn("Cyber Monday and New Jersey"), ["Cyber Monday", "New Jersey"]);
assert.deepEqual(namesIn("What’s Next. Black. Friday Night. Last Week"), []);
const shopping = [
  at(1, "What’s Behind Black Friday’s Slump", 3),
  at(2, "Black Friday, explained", 4),
  at(3, "What’s on sale this Black Friday", 5),
  at(4, "What’s next for the Fed", 6),
  at(5, "What’s Mamdani doing", 7),
];
const bf = groupTopics([...shopping, ...filler2], { now }).map((t) => t.topic);
assert.ok(bf.includes("Black Friday"), `Black Friday chip: ${bf}`);
assert.ok(!bf.some((t) => /^(black|what|friday)$/i.test(t)), `no one-word fragments: ${bf}`);

const macys = [1, 2, 3].map((f) => at(f, "Macy’s Thanksgiving Day Parade, explained", 3 + f));
const mc = groupTopics([...macys, ...filler2], { now }).map((t) => t.topic);
assert.ok(mc.includes("Thanksgiving Day Parade"), `parade chip keeps the parade: ${mc}`);

console.log("news topics: all checks passed");
