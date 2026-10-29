// One episode's playable details (used to play things from Up next).
import { episodeCard, getEpisode, safe } from "@/lib/podcastindex";

export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!/^\d+$/.test(id || "")) return Response.json({ error: "bad id" }, { status: 400 });
  const { data } = await safe(getEpisode(id));
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(episodeCard(data), { headers: { "Cache-Control": "public, s-maxage=3600" } });
}
