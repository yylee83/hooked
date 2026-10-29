import { topChartEpisodes } from "@/lib/charts";

// The next page of top-chart episodes for the Search tab's "Load more".
export async function GET(req) {
  const offset = Math.max(0, Math.min(200, parseInt(new URL(req.url).searchParams.get("offset")) || 0));
  const data = await topChartEpisodes(offset, 10);
  return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
}
