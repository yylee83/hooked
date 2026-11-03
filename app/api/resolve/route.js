// Paste-a-link logging: Apple Podcasts / Spotify link → where to go in Hooked.
import { resolveLink } from "@/lib/links";
import { episodeRefFor, showRefFor } from "@/lib/catalog";
import { logHref, showHref } from "@/lib/addresses";

export async function GET(req) {
  const url = new URL(req.url).searchParams.get("url") || "";
  const r = await resolveLink(url);
  // Our short address (creating a basic entry if needed); the number still works if that fails.
  const go = r.episodeId ? logHref(await episodeRefFor(r.episodeId), r.episodeId)
    : r.feedId ? showHref(await showRefFor(r.feedId), r.feedId) : null;
  return Response.json({ ...r, go });
}
