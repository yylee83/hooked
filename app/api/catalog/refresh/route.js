// Upgrade one of our shows or episodes with full details from Podcast Index.
// The app calls this right after saving something about an episode (see lib/catalog-client.js).
// It only refreshes entries we already have, at most every 6 hours, so it's safe to leave open.
import { NextResponse } from "next/server";
import { refreshEpisode, refreshShow } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const episodeId = /^\d{1,15}$/.test(String(body.episodeId ?? "")) ? String(body.episodeId) : null;
  const feedId = /^\d{1,15}$/.test(String(body.feedId ?? "")) ? String(body.feedId) : null;
  if (!episodeId && !feedId) return NextResponse.json({ error: "episodeId or feedId needed" }, { status: 400 });
  const row = episodeId ? await refreshEpisode(episodeId) : await refreshShow(feedId);
  if (!row) return NextResponse.json({ found: false }, { status: 404 });
  return NextResponse.json({ found: true, id: row.id, source: row.source });
}
