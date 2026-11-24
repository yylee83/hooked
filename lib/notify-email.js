// Notification emails (YY, 2026-11-24): someone followed you, replied, sent you an episode, or gave your review a
// thumbs up or +. Built on the notifications the bell already shows.
//
// - At most one email an hour per person. Whatever happens in between is bundled into their next email.
// - Sent right after the action (the app pings /api/notify-email), with a daily catch-up for anything held back
//   (/api/cron/notify-email; Vercel's Hobby plan runs scheduled jobs once a day).
// - Never emails something already seen in the app, anything older than 3 days, or a thumbs down.
// - Needs RESEND_API_KEY. Sends from EMAIL_FROM (default: Hooked on Pods <hello@hookedonpods.com>).
// - Only the live site emails real people. Previews use a copy of live (real addresses), so there an email goes to
//   EMAIL_TEST_TO instead, or nowhere.
import "server-only";
import { episodeHref } from "./addresses";
import { esc, notifyUnsubToken, siteUrl } from "./digest";

const C = { cobalt: "#2340FF", pink: "#FF7AC6", butter: "#FFE14D", ink: "#15131D", cream: "#FFF7EE", muted: "#55526A" };
const HOUR = 3600 * 1000;
const WINDOW = 3 * 24 * HOUR;
const THUMBS_UP = new Set(["agree", "great", "same", "ooh"]);

export function emailReady() {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress() {
  return process.env.EMAIL_FROM || "Hooked on Pods <hello@hookedonpods.com>";
}

// Real people only from the live site.
function deliverTo(email) {
  if (process.env.VERCEL_ENV === "production" || process.env.EMAIL_LIVE === "1") return email;
  return process.env.EMAIL_TEST_TO || null;
}

// Worth an email? (A thumbs down isn't: it only shows in the app.)
export function emailable(n) {
  if (n.type === "reaction") return THUMBS_UP.has(n.body) || n.body === "adding";
  return ["follow", "rec", "comment", "reply"].includes(n.type);
}

// One line per notification: [plain words, html, link, quote].
function line(n, base, myHandle) {
  const handle = n.actor?.handle;
  const who = handle ? `@${handle}` : "Someone";
  const ep = n.title ? `“${n.title}”` : "an episode";
  const page = `${base}${episodeHref(n.episode_ref, n.episode_id)}`;
  const thread = (owner) => `${page}?from=${encodeURIComponent(owner || myHandle || "")}&talk=1#thread`;
  switch (n.type) {
    case "follow":
      return { short: `${who} followed you`, text: `${who} followed you`, href: `${base}/u/${encodeURIComponent(handle || "")}` };
    case "rec":
      return { short: `${who} sent you an episode`, text: `${who} sent you ${ep}`, href: `${page}?from=${encodeURIComponent(handle || "")}`, quote: n.body };
    case "comment":
      return { short: `${who} replied to your review`, text: `${who} replied to your review of ${ep}`, href: thread(myHandle), quote: n.body };
    case "reply":
      return {
        short: `${who} replied in a conversation`,
        text: `${who} also replied on @${n.owner?.handle || "someone"}'s review of ${ep}`,
        href: thread(n.owner?.handle),
        quote: n.body,
      };
    case "reaction":
      return n.body === "adding"
        ? { short: `${who} wants to listen, thanks to you`, text: `${who} added ${ep} to Up next from your review`, href: thread(myHandle) }
        : { short: `${who} liked your review`, text: `${who} gave your review of ${ep} a thumbs up`, href: thread(myHandle) };
    default:
      return null;
  }
}

export function notifyEmail({ profile, notes, base }) {
  const lines = notes.map((n) => line(n, base, profile.handle)).filter(Boolean);
  const more = lines.length - 1;
  const subject = more > 0 ? `${lines[0].short}, and ${more} more` : lines[0].short;
  const bold = (s) => esc(s).replace(/^(@[\w.]+)/, "<b>$1</b>");

  const rows = lines
    .slice(0, 10)
    .map(
      (l, i) => `<tr><td style="padding:12px 0;${i ? "border-top:1px solid #eee" : ""}"><a href="${l.href}" style="color:${C.ink};text-decoration:none;font-size:15px;line-height:1.45">${bold(l.text)}${
        l.quote ? `<div style="color:${C.muted};font-size:14px;margin-top:4px">“${esc(l.quote)}”</div>` : ""
      }</a></td></tr>`,
    )
    .join("");
  const extra = lines.length > 10 ? `<tr><td style="padding:10px 0;border-top:1px solid #eee;font-size:14px;color:${C.muted}">And ${lines.length - 10} more on Hooked.</td></tr>` : "";
  const unsub = `${base}/api/unsubscribe?k=notify&u=${profile.id}&t=${notifyUnsubToken(profile.id)}`;
  const go = lines.length === 1 ? lines[0].href : `${base}/notifications`;

  const html = `<!doctype html><html><body style="margin:0;background:${C.cream};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream}"><tr><td align="center" style="padding:28px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td style="font-size:28px;font-weight:900;color:${C.cobalt};letter-spacing:-1px">hooked on</td></tr>
    <tr><td style="padding:4px 0 20px"><div style="height:7px;width:150px;border:2px solid ${C.ink};border-radius:99px;background:${C.butter}"><div style="height:7px;width:52px;background:${C.pink};border-radius:99px"></div></div></td></tr>
    <tr><td style="background:#fff;border:3px solid ${C.ink};border-radius:20px;padding:4px 18px 6px"><table role="presentation" width="100%">${rows}${extra}</table></td></tr>
    <tr><td align="center" style="padding:24px 0"><a href="${go}" style="display:inline-block;background:${C.cobalt};color:#fff;font-weight:800;font-size:16px;text-decoration:none;padding:13px 26px;border-radius:99px;border:3px solid ${C.ink}">${lines.length === 1 ? "Open in Hooked" : "See them on Hooked"}</a></td></tr>
    <tr><td align="center" style="font-size:12px;line-height:1.5;color:${C.muted}">You get these when someone follows you, replies, or sends you an episode. At most one an hour.<br><a href="${unsub}" style="color:${C.muted}">Turn off these emails</a></td></tr>
  </table></td></tr></table></body></html>`;

  const text = `${lines.map((l) => `${l.text}${l.quote ? `\n  “${l.quote}”` : ""}\n  ${l.href}`).join("\n\n")}\n\nTurn off these emails: ${unsub}`;
  return { subject, html, text, unsub };
}

async function resend(payload) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// Email each of these people what's waiting for them, if they're due. Returns how many emails went out.
export async function emailDue(db, userIds) {
  if (!emailReady() || !userIds.length) return 0;
  const base = siteUrl();
  const now = Date.now();
  let sent = 0;
  for (const uid of userIds) {
    const { data: profile } = await db.from("profiles").select("id, handle, email_notify").eq("id", uid).maybeSingle();
    if (!profile?.handle || profile.email_notify === false) continue;

    const { data: waiting } = await db
      .from("notifications")
      .select("id, type, episode_id, episode_ref, title, body, created_at, actor:profiles!notifications_actor_id_fkey(handle), owner:profiles!notifications_log_user_id_fkey(handle)")
      .eq("user_id", uid)
      .is("read_at", null)
      .is("emailed_at", null)
      .gte("created_at", new Date(now - WINDOW).toISOString())
      .order("created_at", { ascending: false })
      .limit(30);
    const notes = (waiting || []).filter(emailable);
    if (!notes.length) continue;

    const { data: u } = await db.auth.admin.getUserById(uid);
    const to = u?.user?.email_confirmed_at ? deliverTo(u.user.email) : null;
    if (!to) continue;

    // Claim this hour's email. Two pings at once can't both win, so nobody gets a double.
    const cutoff = new Date(now - HOUR).toISOString();
    await db.from("notify_emails").upsert({ user_id: uid }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data: prev } = await db.from("notify_emails").select("last_sent_at").eq("user_id", uid).maybeSingle();
    const { data: claimed } = await db
      .from("notify_emails")
      .update({ last_sent_at: new Date(now).toISOString() })
      .eq("user_id", uid)
      .lt("last_sent_at", cutoff)
      .select("user_id");
    if (!claimed?.length) continue; // emailed within the hour: this waits for the next one

    const email = notifyEmail({ profile, notes, base });
    const ok = await resend({
      from: fromAddress(),
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: { "List-Unsubscribe": `<${email.unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (!ok) {
      await db.from("notify_emails").update({ last_sent_at: prev?.last_sent_at || "1970-01-01" }).eq("user_id", uid);
      continue;
    }
    await db.from("notifications").update({ emailed_at: new Date().toISOString() }).in("id", notes.map((n) => n.id));
    sent++;
    await new Promise((r) => setTimeout(r, 200)); // well under Resend's 10-a-second limit
  }
  return sent;
}
