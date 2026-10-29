// Sends the weekly email. Vercel runs this on Sunday mornings (see vercel.json).
// Needs: RESEND_API_KEY, DIGEST_FROM, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { digestEmail, siteUrl } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const db = adminDb();
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  if (!db || !key || !from) {
    return NextResponse.json({ skipped: "Weekly email isn't set up yet (missing keys)." });
  }
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const base = siteUrl();

  // Everyone with a handle who hasn't turned the email off.
  const { data: people } = await db.from("profiles").select("id, handle, display_name").eq("email_digest", true).not("handle", "is", null).limit(5000);

  // Emails live in the auth system.
  const emails = new Map();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    data.users.forEach((u) => u.email && u.email_confirmed_at !== null && emails.set(u.id, u.email));
    if (data.users.length < 1000) break;
  }

  let sent = 0;
  const results = [];
  for (const profile of people || []) {
    const to = emails.get(profile.id);
    if (!to) continue;
    const [{ data: notes }, { data: follows }] = await Promise.all([
      db
        .from("notifications")
        .select("type, episode_id, title, body, created_at, actor:profiles!notifications_actor_id_fkey(handle), owner:profiles!notifications_log_user_id_fkey(handle)")
        .eq("user_id", profile.id)
        .is("read_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("follows").select("followee_id").eq("follower_id", profile.id),
    ]);
    const ids = (follows || []).map((f) => f.followee_id);
    const { data: friendLogs } = ids.length
      ? await db
          .from("logs")
          .select("episode_id, title, feed_title, hooked, rating, hook, logged_at, who:profiles!inner(handle)")
          .in("user_id", ids)
          .gte("logged_at", since)
          .order("logged_at", { ascending: false })
          .limit(10)
      : { data: [] };

    if (!notes?.length && !friendLogs?.length) continue; // nothing new: no email
    const email = digestEmail({ profile, notes: notes || [], friendLogs: friendLogs || [], base });
    if (dryRun) {
      results.push({ to, subject: email.subject });
      continue;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: { "List-Unsubscribe": `<${email.unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      }),
    });
    if (res.ok) sent++;
    else results.push({ to, error: res.status });
    await new Promise((r) => setTimeout(r, 600)); // stay under Resend's 2-per-second limit
  }
  return NextResponse.json({ sent, results });
}
