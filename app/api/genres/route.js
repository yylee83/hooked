// Wrapped asks which genre each show belongs to. Categories come from our own shows table (saved from
// Podcast Index or from the show's own feed). Podcast Index is asked only for a show we don't have
// categories for yet; the daily catalog job fills those in over time.
import { NextResponse } from "next/server";
import { getShow, safe } from "@/lib/podcastindex";
import { publicDb } from "@/lib/supabase/public";
import { REF } from "@/lib/catalog";
import { genreOf } from "@/lib/genres";

const PI_ID = /^\d{1,15}$/;

export async function GET(request) {
  // Each id is our short show id, or a Podcast Index number (older logs saved on this device).
  const asked = [...new Set((new URL(request.url).searchParams.get("ids") || "").split(","))]
    .filter((x) => REF.test(x) || PI_ID.test(x))
    .slice(0, 80);
  const refs = asked.filter((x) => REF.test(x));
  const nums = asked.filter((x) => PI_ID.test(x));

  const rows = [];
  const db = publicDb();
  if (db && refs.length) rows.push(...((await db.from("shows").select("id, podcastindex_id, categories").in("id", refs)).data || []));
  if (db && nums.length) rows.push(...((await db.from("shows").select("id, podcastindex_id, categories").in("podcastindex_id", nums)).data || []));
  const byKey = new Map();
  for (const r of rows) {
    byKey.set(r.id, r);
    if (r.podcastindex_id) byKey.set(String(r.podcastindex_id), r);
  }

  const pairs = await Promise.all(
    asked.map(async (key) => {
      const row = byKey.get(key);
      let categories = Array.isArray(row?.categories) ? row.categories : [];
      const piId = row?.podcastindex_id || (PI_ID.test(key) ? key : null);
      if (!categories.length && piId) categories = Object.values((await safe(getShow(piId))).data?.categories || {});
      return [key, categories.length ? genreOf(categories) : "other"];
    })
  );
  return NextResponse.json(Object.fromEntries(pairs), { headers: { "Cache-Control": "public, max-age=3600" } });
}
