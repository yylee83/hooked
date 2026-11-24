// Show search for the "Pick your favorite shows" step after sign-up (components/FavoriteShows.js).
// Same search as the Search page, cut down to what a pick needs: the show's name, cover and ids.
import { NextResponse } from "next/server";
import { artOf, safe, searchShows } from "@/lib/podcastindex";
import { placeAppleShows } from "@/lib/search";
import { withShowRefs } from "@/lib/catalog";

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ shows: [] });
  const found = await safe(searchShows(q, 9));
  const placed = await withShowRefs(await placeAppleShows(found.data || []), "id");
  // A pick is saved by our show id or the Podcast Index number; shows only Apple knows (not brought in yet) are left out.
  const shows = placed
    .filter((s) => s.showRef || (s.id && !s.appleOnly))
    .slice(0, 9)
    .map((s) => ({ feedId: s.appleOnly ? undefined : s.id, showRef: s.showRef, title: s.title, author: s.author, image: artOf(s) }));
  return NextResponse.json({ shows, error: found.error ? "search" : null }, { headers: { "Cache-Control": "public, max-age=600" } });
}
