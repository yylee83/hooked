// One episode's playable details (used to play things from Up next and for the "+" reaction).
// ?ref= is our short id; ?id= is a Podcast Index number (older Up next items).
import { episodeCard, getEpisode, safe } from "@/lib/podcastindex";
import { REF, loadEpisode, withRefs } from "@/lib/catalog";

const headers = { "Cache-Control": "public, s-maxage=3600" };

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const ref = params.get("ref") || "";
  const id = params.get("id") || "";
  if (REF.test(ref)) {
    const { data } = await loadEpisode(ref);
    if (!data?.episode) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(episodeCard(data.episode, data.show), { headers });
  }
  if (!/^\d{1,15}$/.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
  const { data } = await safe(getEpisode(id));
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  const [card] = await withRefs([episodeCard(data)]); // adds our short ids for links
  return Response.json(card, { headers });
}
