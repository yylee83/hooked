// sitemap.xml: the pages we want search engines to find. Lists, then shows and episodes people have logged (their
// pages carry public reviews). Profiles stay out for now (YY, 2026-11-24). Rebuilt once a day.
import { briefs } from "@/lib/briefs";
import { loggedRefs, publishedBriefIds } from "@/lib/supabase/public";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 86400;

export default async function sitemap() {
  const base = siteUrl();
  const [{ episodes, shows }, lists] = await Promise.all([
    loggedRefs().catch(() => ({ episodes: [], shows: [] })),
    publishedBriefIds().catch(() => []),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/lists`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/search`, changeFrequency: "daily", priority: 0.5 },
    ...briefs.map((b) => ({ url: `${base}/lists/${b.slug}`, changeFrequency: "weekly", priority: 0.9 })),
    ...lists.map((b) => ({ url: `${base}/lists/b/${b.id}`, lastModified: b.created_at, changeFrequency: "weekly", priority: 0.7 })),
    ...shows.map(([ref, at]) => ({ url: `${base}/show/${ref}`, lastModified: at, changeFrequency: "weekly", priority: 0.6 })),
    ...episodes.map(([ref, at]) => ({ url: `${base}/episode/${ref}`, lastModified: at, changeFrequency: "weekly", priority: 0.7 })),
  ];
}
