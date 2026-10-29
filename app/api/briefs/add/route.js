// Brief builder: add one episode from an Apple Podcasts or Spotify link.
import { NextResponse } from "next/server";
import { resolveLink } from "@/lib/links";
import { briefItem } from "@/lib/briefs-server";

export const maxDuration = 30;

export async function GET(request) {
  const u = new URL(request.url);
  const link = u.searchParams.get("url") || "";
  const topic = (u.searchParams.get("topic") || "").trim().slice(0, 80);
  const mode = u.searchParams.get("mode") === "full" ? "full" : "clips";
  const r = await resolveLink(link);
  if (!r.episodeId) {
    const error = r.feedId ? "That's a link to a show. Paste a link to one episode." : r.error || "We couldn't find that episode.";
    return NextResponse.json({ error }, { status: 404 });
  }
  const item = await briefItem(r.episodeId, topic, mode);
  if (!item) return NextResponse.json({ error: "We couldn't load that episode." }, { status: 404 });
  return NextResponse.json({ item });
}
