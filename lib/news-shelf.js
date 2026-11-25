// The trusted shelf for "Go deeper" (Search's "In the news, explained", lib/news-explained.js): shows known for real
// background reporting. Their episodes come first; any other show must pass a quality bar (lib/news-explained.js).
// Matched by name (the start of the show's title), so "Planet Money" also covers "Planet Money: …" feeds.
// To add a show, add its name here; to keep one out of a story, block it in Supabase (news_picks).
export const SHELF = [
  // history and how-we-got-here
  "Throughline", "The Rest Is History", "The Rest Is Politics", "You're Dead to Me", "In Our Time", "Hardcore History",
  "History Extra", "Revisionist History", "Behind the Bastards", "Unexplainable", "Stuff You Should Know",
  // ideas and interviews
  "Fresh Air", "The Ezra Klein Show", "The Gray Area", "Making Sense", "Conversations with Tyler", "Intelligence Squared",
  "The New Yorker Radio Hour", "The Political Scene", "On the Media", "Code Switch", "It's Been a Minute", "Hidden Brain",
  "Invisibilia", "The Sunday Read", "The Weeds", "Fareed Zakaria GPS", "Lawfare", "Statecraft", "Ones and Tooze",
  // reporting and stories
  "This American Life", "Radiolab", "99% Invisible", "Reveal", "Criminal", "Serial", "Search Engine", "Heavyweight",
  // money, science and tech
  "Planet Money", "The Indicator from Planet Money", "Freakonomics Radio", "Odd Lots", "Acquired", "Decoder with Nilay Patel",
  "Hard Fork", "Big Technology Podcast", "Babbage", "Science Vs", "Short Wave", "Science Friday", "Ologies",
];

const simple = (s = "") =>
  String(s).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9%]+/g, " ").trim().replace(/^the /, "");
const KEYS = SHELF.map(simple);

/** Is this show on the trusted shelf? */
export const onShelf = (title = "") => {
  const t = simple(title);
  return !!t && KEYS.some((k) => t === k || t.startsWith(`${k} `));
};
