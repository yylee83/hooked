// Paste-a-link logging: Apple Podcasts / Spotify link → where to go in Hooked.
import { linkTarget, resolveLink } from "@/lib/links";

export async function GET(req) {
  const url = new URL(req.url).searchParams.get("url") || "";
  const r = await resolveLink(url);
  return Response.json({ ...r, go: await linkTarget(r) });
}
