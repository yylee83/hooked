// Daily: upgrade basic show/episode entries and refresh stale ones from Podcast Index.
// Vercel runs this once a day (see vercel.json). Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET.
import { NextResponse } from "next/server";
import { refreshStale } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  return NextResponse.json(await refreshStale({ limit: 40 }));
}
