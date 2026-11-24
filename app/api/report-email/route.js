// The app pings this right after someone sends a report, so the team's email goes out now (lib/report-email.js).
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { emailReady } from "@/lib/notify-email";
import { emailReports } from "@/lib/report-email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  const db = adminDb();
  if (!db || !emailReady()) return NextResponse.json({ skipped: true });
  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const { data } = token ? await db.auth.getUser(token) : { data: null };
  if (!data?.user?.id) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const sent = await emailReports(db);
  return NextResponse.json({ sent });
}
