import FavoriteShows from "@/components/FavoriteShows";
import { topCharts } from "@/lib/charts";

export const metadata = { title: "Pick your favorite shows" };
export const revalidate = 3600;

// First step after sign-up (YY, 2026-11-23): a few favorite shows, saved as hooked shows, so Suggested follows,
// New episodes and Home have something to go on from day one.
export default async function FavoriteShowsPage() {
  const seen = new Set();
  const chart = (await topCharts(30)).filter((s) => s.feedId && !seen.has(s.feedId) && seen.add(s.feedId));
  const shows = chart.slice(0, 18).map(({ feedId, showRef, title, image }) => ({ feedId, showRef, title, image }));
  return <FavoriteShows popular={shows} />;
}
