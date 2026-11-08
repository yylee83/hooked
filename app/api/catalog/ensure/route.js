// "Make sure Hooked has these": the app calls this before saving a log, Up next item, send or hooked
// show that it only knows by Podcast Index numbers. We find our entry, or create one from Podcast
// Index's own details, and return our ids. Entries only ever come from Podcast Index, never from what
// the app sends, so this can't be used to plant fake shows or episodes.
import { NextResponse } from "next/server";
import { episodeRefFor, showRefFor } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const nums = (a, max) => [...new Set((Array.isArray(a) ? a : []).map(String).filter((x) => /^\d{1,15}$/.test(x)))].slice(0, max);

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const episodeIds = nums(body.episodeIds, 50);
  const feedIds = nums(body.feedIds, 50);
  if (!episodeIds.length && !feedIds.length) return NextResponse.json({ error: "episodeIds or feedIds needed" }, { status: 400 });
  const pairs = async (ids, find) => Object.fromEntries((await Promise.all(ids.map(async (id) => [id, await find(id).catch(() => null)]))).filter(([, ref]) => ref));
  const [episodes, shows] = await Promise.all([pairs(episodeIds, episodeRefFor), pairs(feedIds, showRefFor)]);
  return NextResponse.json({ episodes, shows });
}
