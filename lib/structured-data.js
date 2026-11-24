// schema.org descriptions of Hooked's public pages (shown through components/JsonLd.js). Public reviews and
// ratings only: never listening history, Up next or sends.
import { plainText } from "./podcastindex";
import { siteUrl } from "./site-url";
import { episodeHref } from "./addresses";

export const BRAND = "Hooked on Pods";
const abs = (path) => new URL(path, siteUrl()).toString();
const iso = (unix) => (unix > 0 ? new Date(unix * 1000).toISOString() : undefined);
const duration = (s) => (s > 0 ? `PT${Math.floor(s / 3600)}H${Math.floor((s % 3600) / 60)}M${Math.floor(s % 60)}S` : undefined);
const short = (s, n = 300) => {
  const t = plainText(s || "");
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t || undefined;
};

function rating(avg, count) {
  if (!(count > 0) || !(avg > 0)) return undefined;
  return { "@type": "AggregateRating", ratingValue: Math.round(avg * 10) / 10, ratingCount: count, bestRating: 5, worstRating: 0.5 };
}

export function siteData() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND,
      alternateName: "Hooked",
      url: abs("/"),
      description: "Hooked on Pods is a social app for podcast episodes: log what you listen to, rate and review episodes, follow friends, and find what to play next.",
    },
    { "@context": "https://schema.org", "@type": "Organization", name: BRAND, url: abs("/"), logo: abs("/apple-icon.png") },
  ];
}

// `reviews` come from episodeReviews (lib/supabase/public.js).
export function episodeData({ card, description, path, reviews = [] }) {
  const rated = reviews.filter((r) => Number(r.rating) > 0);
  const avg = rated.length ? rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length : 0;
  return {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: card.title,
    url: abs(path),
    description: short(description),
    image: card.image || undefined,
    datePublished: iso(card.date),
    timeRequired: duration(card.duration),
    ...(card.audio ? { associatedMedia: { "@type": "MediaObject", contentUrl: card.audio } } : {}),
    ...(card.feedTitle
      ? { partOfSeries: { "@type": "PodcastSeries", name: card.feedTitle, ...(card.showRef ? { url: abs(`/show/${card.showRef}`) } : {}) } }
      : {}),
    aggregateRating: rating(avg, rated.length),
    review: reviews
      .filter((r) => r.hook || Number(r.rating) > 0)
      .slice(0, 10)
      .map((r) => ({
        "@type": "Review",
        author: { "@type": "Person", name: `@${r.who.handle}`, url: abs(`/u/${r.who.handle}`) },
        datePublished: r.logged_at || undefined,
        ...(r.hook ? { reviewBody: r.hook } : {}),
        ...(Number(r.rating) > 0 ? { reviewRating: { "@type": "Rating", ratingValue: Number(r.rating), bestRating: 5, worstRating: 0.5 } } : {}),
      })),
  };
}

// `stats` from showStats (lib/supabase/public.js).
export function showData({ show, path, image, stats }) {
  return {
    "@context": "https://schema.org",
    "@type": "PodcastSeries",
    name: show.title,
    url: abs(path),
    description: short(show.description),
    image: image || undefined,
    ...(show.author || show.ownerName ? { author: { "@type": "Person", name: show.author || show.ownerName } } : {}),
    ...(/^https?:\/\//.test(show.link || "") ? { sameAs: show.link } : {}),
    aggregateRating: rating(stats?.avg, stats?.ratings),
  };
}

// A list page: its episodes, in order.
export function listData({ title, dek, path, author, items }) {
  const usable = items.filter((it) => it.found !== false && (it.episodeRef || it.episodeId));
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    description: dek || undefined,
    url: abs(path),
    ...(author ? { author: { "@type": "Person", name: `@${author}`, url: abs(`/u/${author}`) } } : {}),
    numberOfItems: usable.length,
    itemListElement: usable.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: abs(episodeHref(it.episodeRef, it.episodeId)),
      name: [it.episode, it.show].filter(Boolean).join(" · "),
      ...(it.caption ? { description: it.caption } : {}),
    })),
  };
}
