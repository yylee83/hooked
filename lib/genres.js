// Folds Podcast Index's ~100 categories into a handful of listening "genres" for My log.
// Order matters: the first group that matches a show's categories wins.

export const GENRES = [
  { key: "news", label: "News & politics", match: /news|politics|government|daily/i },
  { key: "crime", label: "True crime", match: /crime/i },
  { key: "pop", label: "Pop culture", match: /tv|film|entertainment|celebrit|after.?shows|reviews|fashion|music commentary|music interviews/i },
  { key: "comedy", label: "Comedy", match: /comedy|improv|stand.?up/i },
  { key: "biz", label: "Business & tech", match: /business|tech|invest|entrepreneur|careers|marketing|management|startup/i },
  { key: "culture", label: "Society & culture", match: /society|culture|relationships|personal journals|philosophy|documentary|places|travel/i },
  { key: "health", label: "Health & wellness", match: /health|fitness|mental|nutrition|medicine|self.?improvement|sexuality|alternative/i },
  { key: "learn", label: "Science & history", match: /science|history|nature|astronomy|physics|education|language|courses|how to/i },
  { key: "sports", label: "Sports", match: /sport|football|basketball|baseball|soccer|hockey|tennis|golf|running|wrestling/i },
  { key: "arts", label: "Arts & books", match: /arts|books|design|food|performing|visual|fiction|drama/i },
];

export function genreOf(categoryNames = []) {
  for (const g of GENRES) if (categoryNames.some((c) => g.match.test(c))) return g.key;
  return "other";
}

export const genreLabel = (key) => GENRES.find((g) => g.key === key)?.label || "Everything else";
