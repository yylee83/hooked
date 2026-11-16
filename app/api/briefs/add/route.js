// One episode for a brief: from an Apple Podcasts or Spotify link (the brief builder's paste box, ?url=), or by our
// episode id or its Podcast Index number ("+ Brief" on an episode page, ?episode=).
import { NextResponse } from "next/server";
import { resolveLink } from "@/lib/links";
import { briefItem } from "@/lib/briefs-server";

export const maxDuration = 30;

const EPISODE = /^([a-z2-9]{8}|\d{1,15})$/;

export async function GET(request) {
  const u = new URL(request.url);
  const topic = (u.searchParams.get("topic") || "").trim().slice(0, 80);
  const mode = u.searchParams.get("mode") === "full" ? "full" : "clips";
  const episode = u.searchParams.get("episode") || "";
  let key;
  if (episode) {
    if (!EPISODE.test(episode)) return NextResponse.json({ error: "We couldn't find that episode." }, { status: 400 });
    key = /^\d+$/.test(episode) ? Number(episode) : episode;
  } else {
    const r = await resolveLink(u.searchParams.get("url") || "");
    // Our own episode (a show read from its own feed, or Spotify-only), or a Podcast Index number.
    key = r.episodeRef || r.episodeId;
    if (!key) {
      const show = r.feedId || r.showRef;
      const error = show ? (r.note ? "We found the show, but not that exact episode." : "That's a link to a show. Paste a link to one episode.") : r.error || "We couldn't find that episode.";
      return NextResponse.json({ error }, { status: 404 });
    }
  }
  const { item, error } = await briefItem(key, topic, mode);
  if (!item) return NextResponse.json({ error }, { status: 404 });
  return NextResponse.json({ item });
}
