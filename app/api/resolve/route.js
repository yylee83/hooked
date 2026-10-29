// Paste-a-link logging: Apple Podcasts / Spotify link → where to go in Hooked on.
import { resolveLink } from "@/lib/links";

export async function GET(req) {
  const url = new URL(req.url).searchParams.get("url") || "";
  const r = await resolveLink(url);
  const go = r.episodeId ? `/log/${r.episodeId}` : r.feedId ? `/show/${r.feedId}` : null;
  return Response.json({ ...r, go });
}
