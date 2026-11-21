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
        show: "Ear Hustle",
        label: "START HERE",
        episode: "Cellies",
        caption: "Life in a prison cell, told from inside.",
      },
      {
        show: "Invisibilia",
        label: "FULL EPISODE",
        episode: "How to Become Batman",
        caption: "A blind man who sees by clicking.",
      },
      {
        show: "We Can Do Hard Things",
        label: "FULL EPISODE",
        episode: "Enneagram: What does your number say about you",
        caption: "What your number says about you.",
      },
      {
        show: "Hidden Brain",
        label: "FULL EPISODE",
        episode: "Romeo and Juliet in Kigali",
        caption: "Can a soap opera heal a country?",
      },
      {
        show: "Reply All",
        label: "FULL EPISODE",
        episode: "What It Looks Like",
        caption: "Depression, described honestly.",
      },
      {
        show: "The Anthropocene Reviewed",
        label: "FULL EPISODE",
        episode: "Auld Lang Syne",
        caption: "John Green on the song we sing at midnight.",
      },
    ],
  },
  {
    slug: "true-crime",
    color: "bubblegum",
    topic: "",
    mode: "full",
    title: "Best of true crime",
    dek: "The episodes fans point newcomers to, from the show that started it all to the ones you haven't heard of yet.",
    share: "The true crime episodes everyone recommends.",
    items: [
      {
        show: "Serial",
        label: "START HERE",
        episode: "The Alibi",
        caption: "The episode that started it all.",
      },
      {
        show: "My Favorite Murder",
        label: "FULL EPISODE",
        episode: "Investigateighteen Discovery",
        caption: "Mary Vincent, the ultimate survivor.",
      },
      {
        show: "My Favorite Murder",
        label: "FULL EPISODE",
        episode: "Garden Party",
        caption: "She fought off the hitman her husband hired.",
      },
      {
        show: "Criminal",
        label: "FULL EPISODE",
        episode: "695BGK",
        caption: "One wrong letter on a license plate.",
      },
      {
        show: "Morbid",
        label: "FULL EPISODE",
        episode: "Michelle Knight, Amanda Berry",
        caption: "Held for a decade. Then they got out.",
      },
      {
        show: "Bear Brook",
        label: "FULL EPISODE",
        episode: "Hide and Seek",
        caption: "Two barrels in the woods. Decades to name them.",
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
        caption: "How to actually win at online dating.",
      },
      {
        show: "Freakonomics Radio",
        label: "FULL EPISODE",
        episode: "Why Did You Marry That Person",
        caption: "What really decides who we marry.",
      },
      {
        show: "The Economics of Everyday Things",
        label: "FULL EPISODE",
        episode: "Matchmakers",
        caption: "Love, by the numbers.",
      },
      {
        show: "Hidden Brain",
        label: "FULL EPISODE",
        episode: "How Love Really Works",
        caption: "Your type isn't who you'll fall for.",
      },
      {
        show: "Where Should We Begin? with Esther Perel",
        label: "FULL EPISODE",
        episode: "You Slept With My Best Friend",
        caption: "The ultimate betrayal, in the therapy room.",
      },
      {
        show: "Strangers",
        label: "FULL EPISODE",
        episode: "Love Hurts",
        caption: "Heartbreak, raw and real.",
      },
      {
        show: "Modern Love",
        label: "FULL EPISODE",
        episode: "To Fall in Love",
        caption: "36 questions to fall in love.",
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
        caption: "Allison Williams, totally unfiltered.",
      },
      {
        show: "Good Hang with Amy Poehler",
        label: "FULL EPISODE",
        episode: "Quinta Brunson",
        caption: "Quinta Brunson and Amy Poehler, just hanging.",
      },
      {
        show: "Conan O'Brien Needs A Friend",
        label: "FULL EPISODE",
        episode: "Tig Notaro",
        caption: "The driest wit in comedy makes Conan lose it.",
      },
      {
        show: "WTF with Marc Maron",
        label: "FULL EPISODE",
        episode: "Episode 1358 - Jerrod Carmichael",
        caption: "Jerrod Carmichael, brutally honest.",
      },
      {
        show: "Conan O'Brien Needs A Friend",
        label: "FULL EPISODE",
        episode: "Stephen Colbert",
        caption: "Two late-night legends, off the clock.",
      },
      {
        show: "Fly on the Wall with Dana Carvey and David Spade",
        label: "FULL EPISODE",
        episode: "Maya Rudolph",
        caption: "Maya Rudolph's best SNL stories.",
      },
      {
        show: "WTF with Marc Maron",
        label: "FULL EPISODE",
        episode: "Barack Obama",
        caption: "Barack Obama sits down with Marc Maron.",
      },
    ],
  },
];

export function getBrief(slug) {
  return briefs.find((b) => b.slug === slug) || null;
}
