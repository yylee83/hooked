import TastePicker from "@/components/TastePicker";
import { topCharts } from "@/lib/charts";

export const metadata = { title: "What are you into?" };
export const revalidate = 3600;

export default async function WelcomePage() {
  const seen = new Set();
  const chart = (await topCharts(50)).filter((s) => s.feedId && !seen.has(s.feedId) && seen.add(s.feedId));
  const shows = chart.map(({ feedId, title, author, image, genreKey }) => ({ feedId, title, author, image, genreKey }));
  return <TastePicker shows={shows} />;
}
