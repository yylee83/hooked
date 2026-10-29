// One-click "turn off weekly emails" from the email footer.
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/supabase/admin";
import { checkUnsubToken, siteUrl } from "@/lib/digest";

async function turnOff(request) {
  const url = new URL(request.url);
  const u = url.searchParams.get("u") || "";
  const t = url.searchParams.get("t") || "";
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(u) || !checkUnsubToken(u, t)) return false;
  const { error } = await db.from("profiles").update({ email_digest: false }).eq("id", u);
  return !error;
}

export async function GET(request) {
  const ok = await turnOff(request);
  const page = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hooked on</title>
  <body style="margin:0;background:#FFF7EE;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15131D;display:grid;place-items:center;min-height:100vh;padding:24px">
  <div style="max-width:420px;text-align:center"><div style="font-size:36px;font-weight:900;color:#2340FF">hooked on</div>
  <p style="font-size:20px;font-weight:700;margin:24px 0 8px">${ok ? "Weekly emails are off." : "That link didn't work."}</p>
  <p style="color:#55526A">${ok ? "You can turn them back on anytime from My log." : "Turn weekly emails off from My log instead."}</p>
  <p style="margin-top:24px"><a href="${siteUrl()}/me" style="color:#2340FF;font-weight:700">Go to My log</a></p></div></body>`;
  return new NextResponse(page, { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Email apps' built-in "Unsubscribe" button posts here.
export async function POST(request) {
  const ok = await turnOff(request);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
