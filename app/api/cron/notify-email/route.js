// Daily catch-up for notification emails (and report emails to the team): anything held back by the one-an-hour limit, or whose ping never
// arrived. Vercel runs it each morning (vercel.json; the Hobby plan allows once a day).
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { emailDue, emailReady } from "@/lib/notify-email";
import { emailReports } from "@/lib/report-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const db = adminDb();
  if (!db || !emailReady()) return NextResponse.json({ skipped: "Notification emails aren't set up yet (missing keys)." });
  const { data } = await db
    .from("notifications")
    .select("user_id")
    .is("emailed_at", null)
    .is("read_at", null)
    .gte("created_at", new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString())
    .limit(2000);
  const people = [...new Set((data || []).map((n) => n.user_id))];
  const sent = await emailDue(db, people);
  // Reports whose email didn't go out when they were made.
  const reports = await emailReports(db);
  return NextResponse.json({ people: people.length, sent, reports });
}
