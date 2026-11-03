// One episode's playable details (used to play things from Up next).
import { episodeCard, getEpisode, safe } from "@/lib/podcastindex";
import { withRefs } from "@/lib/catalog";

export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!/^\d+$/.test(id || "")) return Response.json({ error: "bad id" }, { status: 400 });
  const { data } = await safe(getEpisode(id));
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  const [card] = await withRefs([episodeCard(data)]); // adds our short ids for links
  return Response.json(card, { headers: { "Cache-Control": "public, s-maxage=3600" } });
}
