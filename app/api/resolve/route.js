// The "+" button's paste box: Apple Podcasts / Spotify link → its log sheet (or the show page).
import { linkTarget, resolveLink } from "@/lib/links";

export async function GET(req) {
  const url = new URL(req.url).searchParams.get("url") || "";
  const r = await resolveLink(url);
  return Response.json({ ...r, go: await linkTarget(r, { log: true }) });
}
