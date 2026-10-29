// My log asks which genre each show belongs to, using the show's Podcast Index categories.
import { NextResponse } from "next/server";
import { getShow, safe } from "@/lib/podcastindex";
import { genreOf } from "@/lib/genres";

export async function GET(request) {
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") || "").split(","))]
    .filter((x) => /^\d+$/.test(x))
    .slice(0, 80);
  const pairs = await Promise.all(
    ids.map(async (id) => {
      const { data } = await safe(getShow(id));
      return [id, data ? genreOf(Object.values(data.categories || {})) : "other"];
    })
  );
  return NextResponse.json(Object.fromEntries(pairs), { headers: { "Cache-Control": "public, max-age=3600" } });
}
