// Daily: upgrade basic show/episode entries and refresh stale ones from Podcast Index, and forget listening and
// search history older than a year (prune_history, supabase/migrations/20261112120000_listening_search_history.sql).
// Vercel runs this once a day (see vercel.json). Needs SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET.
import { NextResponse } from "next/server";
import { refreshStale } from "@/lib/catalog";
import { adminDb } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const pruned = await adminDb()?.rpc("prune_history").then(({ error }) => !error, () => false);
  return NextResponse.json({ ...(await refreshStale({ limit: 40 })), historyPruned: !!pruned });
}
