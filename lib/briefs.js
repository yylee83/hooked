// Briefs: a topic, the best episodes and sections from several shows, and each show's angle.
// To add a brief, copy one of these blocks and change the words.
// color: "cobalt", "bubblegum" or "butter".
// label: "START HERE", "FULL EPISODE" or "SECTION".

export const briefs = [
  {
    slug: "midterms",
    color: "cobalt",
    title: "The Midterms",
    dek: "Two weeks out. Four shows from across the spectrum, each with a different way in.",
    meta: "4 shows · About an hour · Left, right & center",
    share: "Sound smart about the midterms.",
    items: [
      {
        show: "CNN 5 Things",
        label: "FULL EPISODE",
        episode: "The Swing Voters that Could Define the Midterms",
        angle: "who's still undecided",
      },
      {
        show: "Today, Explained",
        label: "FULL EPISODE",
        episode: "Can you buy the midterms?",
        angle: "the money",
      },
      {
        show: "The Fox News Rundown",
        label: "SECTION",
        episode: "Key Race That Could Help the GOP Keep Control of the Senate",
        angle: "the Senate map",
      },
      {
        show: "WSJ's Take On the Week",
        label: "SECTION",
        episode: "What the Midterm 'Affordability Election' Means for Markets",
        angle: "the economy",
      },
    ],
  },
  {
    slug: "tradwives",
    color: "bubblegum",
    title: "Tradwives",
    dek: "Everyone's reading *Yesteryear*. Here's the debate behind it: the book, the motherhood pressure, the money and the faith.",
    meta: "4 shows · Multiple views",
    share: "Sound smart about tradwives.",
    items: [
      {
        show: "Radio Atlantic",
        label: "START HERE",
        episode: "The Tragedy of the Tradwife",
        angle: "the author of Yesteryear",
      },
      {
        show: "Code Switch",
        label: "FULL EPISODE",
        episode: "Tradwives and the pressures of modern motherhood",
        angle: "modern motherhood",
      },
      {
        show: "On the Issues with Michele Goodwin",
        label: "SECTION",
        episode: "Tradwives, Turning Point and the Business of Anti-Feminism",
        angle: "the politics and money",
      },
      {
        show: "Church & Culture Podcast",
        label: "FULL EPISODE",
        episode: "On Trad Wives",
        angle: "a faith perspective",
      },
    ],
  },
];

export function getBrief(slug) {
  return briefs.find((b) => b.slug === slug) || null;
}
