// The app pings this right after you follow someone, reply, send an episode or react, so the other person's email
// goes out now rather than at the daily catch-up. It only looks at notifications you just caused.
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { emailDue, emailReady } from "@/lib/notify-email";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  const db = adminDb();
  if (!db || !emailReady()) return NextResponse.json({ skipped: true });
  const token = (request.headers.get("authorization") || "").replace(/^Bearer /, "");
  const { data } = token ? await db.auth.getUser(token) : { data: null };
  const me = data?.user?.id;
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: mine } = await db
    .from("notifications")
    .select("user_id")
    .eq("actor_id", me)
    .is("emailed_at", null)
    .is("read_at", null)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .limit(50);
  const people = [...new Set((mine || []).map((n) => n.user_id))].slice(0, 10);
  const sent = await emailDue(db, people);
  return NextResponse.json({ sent });
}
