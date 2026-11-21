// Briefs: a topic, the best episodes and sections from several shows, and each show's angle.
// To add a brief, copy one of these blocks and change the words.
// color: "cobalt", "bubblegum" or "butter".
// label: "START HERE", "FULL EPISODE" or "SECTION".
// mode: "full" plays whole episodes; "clips" plays only the parts where the topic comes up.
// topic: words to look for in transcripts, so "Play the cut" plays only those parts (clips briefs only).
//        Separate alternatives with commas.
// show: the show's name. episode: part of the episode's title, as the show's feed writes it. Hooked looks through
//       the show's whole list and takes the earliest match, so a classic finds the original, not a rerun.

export const briefs = [
  {
    slug: "stranger-than-fiction",
    color: "butter",
    topic: "",
    mode: "full",
    title: "Stranger than fiction",
    dek: "Mysteries, scams and rabbit holes you'll tell your friends about.",
    share: "Mysteries you'll tell your friends about.",
    items: [
      {
        show: "Heavyweight",
        label: "START HERE",
        episode: "Gregor",
        caption: "He lent Moby his CDs before Moby was famous. Now he wants them back.",
      },
      {
        show: "Mystery Show",
        label: "FULL EPISODE",
        episode: "Source Code",
        caption: "One question, investigated to the end: how tall is Jake Gyllenhaal, really?",
      },
      {
        show: "Reply All",
        label: "FULL EPISODE",
        episode: "The Case of the Missing Hit",
        caption: "He remembers every note. The internet says the song never existed.",
      },
      {
        show: "Reply All",
        label: "FULL EPISODE",
        episode: "Long Distance",
        caption: "A scammer calls the host. So he calls back. And keeps calling.",
      },
      {
        show: "Sweet Bobby",
        label: "FULL EPISODE",
        episode: "Sliding doors",
        caption: "She fell for a man online. He was never who he said he was.",
      },
      {
        show: "Mystery Show",
        label: "FULL EPISODE",
        episode: "Belt Buckle",
        caption: "One belt buckle found on the street. One very stubborn search for its owner.",
      },
      {
        show: "Search Engine",
        label: "FULL EPISODE",
        episode: "Why didn't Chris and Dan get into Berghain",
        caption: "Two guys get turned away from the world's hardest club. They need to know why.",
      },
    ],
  },
  {
    slug: "changed-my-life",
    color: "cobalt",
    topic: "",
    mode: "full",
    title: "Podcasts that changed my life",
    dek: "This may be your next Roman Empire.",
    share: "Episodes that become your Roman Empire.",
    items: [
      {
        show: "TED Talks Daily",
        label: "START HERE",
        episode: "How I hacked online dating",
        angle: "the dating spreadsheet",
      },
      {
        show: "Terrible, Thanks for Asking",
        label: "FULL EPISODE",
        episode: "It Just Happens",
        angle: "hard to forget",
      },
      {
        show: "Invisibilia",
        label: "FULL EPISODE",
        episode: "How to Become Batman",
        angle: "expectations",
      },
      {
        show: "We Can Do Hard Things",
        label: "FULL EPISODE",
        episode: "Enneagram: What does your number say about you",
        angle: "know your number",
      },
      {
        show: "Hidden Brain",
        label: "FULL EPISODE",
        episode: "Romeo and Juliet in Kigali",
        angle: "healing after genocide",
      },
      {
        show: "Reply All",
        label: "FULL EPISODE",
        episode: "What It Looks Like",
        angle: "depression, honestly",
      },
      {
        show: "The Anthropocene Reviewed",
        label: "FULL EPISODE",
        episode: "Auld Lang Syne",
        angle: "time and memory",
      },
    ],
  },
  {
    slug: "true-crime",
    color: "bubblegum",
    topic: "",
    mode: "full",
    title: "Best of true crime",
    dek: "The episodes fans point newcomers to, from *My Favorite Murder*, *Morbid* and the show that started it all.",
    share: "The true crime episodes everyone recommends.",
    items: [
      {
        show: "Serial",
        label: "START HERE",
        episode: "The Alibi",
        angle: "the one that started it",
      },
      {
        show: "My Favorite Murder",
        label: "FULL EPISODE",
        episode: "Investigateighteen Discovery",
        angle: "Mary Vincent survives",
      },
      {
        show: "My Favorite Murder",
        label: "FULL EPISODE",
        episode: "Garden Party",
        angle: "the hitman next door",
      },
      {
        show: "Morbid",
        label: "FULL EPISODE",
        episode: "Carl Panzram Part 1",
        angle: "a life of violence",
      },
      {
        show: "Morbid",
        label: "FULL EPISODE",
        episode: "Michelle Knight, Amanda Berry",
        angle: "three women escape",
      },
      {
        show: "Morbid",
        label: "FULL EPISODE",
        episode: "Lady of the Dunes",
        angle: "unnamed for 48 years",
      },
    ],
  },
  {
    slug: "love-complicated",
    color: "bubblegum",
    topic: "",
    mode: "full",
    title: "Love, but complicated",
    dek: "Dating, marriage and heartbreak, with the data and the feelings.",
    share: "Dating, marriage and heartbreak.",
    items: [
      {
        show: "Freakonomics Radio",
        label: "START HERE",
        episode: "What You Don't Know About Online Dating",
        angle: "how to win online dating",
      },
      {
        show: "Freakonomics Radio",
        label: "FULL EPISODE",
        episode: "Why Did You Marry That Person",
        angle: "who we end up with",
      },
      {
        show: "The Economics of Everyday Things",
        label: "FULL EPISODE",
        episode: "Matchmakers",
        angle: "a matchmaker's data",
      },
      {
        show: "Where Should We Begin? with Esther Perel",
        label: "FULL EPISODE",
        episode: "You Slept With My Best Friend",
        angle: "the betrayal",
      },
      {
        show: "Strangers",
        label: "FULL EPISODE",
        episode: "Love Hurts",
        angle: "after the breakup",
      },
      {
        show: "Modern Love",
        label: "FULL EPISODE",
        episode: "To Fall in Love",
        angle: "the 36 questions",
      },
    ],
  },
  {
    slug: "comedy-interviews",
    color: "butter",
    topic: "",
    mode: "full",
    title: "The best comedy interviews",
    dek: "Funny people at their most honest, from Marc Maron's garage to Conan's couch.",
    share: "The comedy interviews everyone raves about.",
    items: [
      {
        show: "Las Culturistas with Matt Rogers and Bowen Yang",
        label: "START HERE",
        episode: "RSVP Yes",
        angle: "Allison Williams",
      },
      {
        show: "Good Hang with Amy Poehler",
        label: "FULL EPISODE",
        episode: "Quinta Brunson",
        angle: "Quinta Brunson",
      },
      {
        show: "WTF with Marc Maron",
        label: "FULL EPISODE",
        episode: "Episode 1358 - Jerrod Carmichael",
        angle: "Jerrod Carmichael",
      },
      {
        show: "Conan O'Brien Needs A Friend",
        label: "FULL EPISODE",
        episode: "Stephen Colbert",
        angle: "Stephen Colbert",
      },
      {
        show: "Fly on the Wall with Dana Carvey and David Spade",
        label: "FULL EPISODE",
        episode: "Maya Rudolph",
        angle: "Maya Rudolph",
      },
      {
        show: "WTF with Marc Maron",
        label: "FULL EPISODE",
        episode: "Barack Obama",
        angle: "Barack Obama",
      },
    ],
  },
];

export function getBrief(slug) {
  return briefs.find((b) => b.slug === slug) || null;
}
