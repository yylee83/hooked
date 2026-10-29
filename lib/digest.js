// The weekly email: unread notifications plus what the people you follow logged this week.
import "server-only";
import crypto from "crypto";

const C = { cobalt: "#2340FF", pink: "#FF7AC6", butter: "#FFE14D", ink: "#15131D", cream: "#FFF7EE", muted: "#55526A" };

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  ).replace(/\/$/, "");
}

// Signed unsubscribe links, so nobody can turn off someone else's email.
export function unsubToken(userId) {
  return crypto.createHmac("sha256", process.env.CRON_SECRET || "dev").update(`unsub:${userId}`).digest("hex").slice(0, 32);
}

export function checkUnsubToken(userId, token) {
  const good = unsubToken(userId);
  return typeof token === "string" && token.length === good.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(good));
}

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const stars = (r) => (r ? "★".repeat(Math.floor(r)) + (r % 1 ? "½" : "") : "");

function noteLine(n, base, myHandle) {
  const who = n.actor?.handle ? `@${esc(n.actor.handle)}` : "Someone";
  const ep = n.title ? `“${esc(n.title)}”` : "an episode";
  const words = { same: "same", ooh: "ooh", adding: "adding it", disagree: "hard disagree" };
  const thread = (owner) => `${base}/episode/${n.episode_id}?from=${encodeURIComponent(owner || myHandle || "")}#thread`;
  switch (n.type) {
    case "follow":
      return [`<b>${who}</b> followed you`, `${base}/u/${encodeURIComponent(n.actor?.handle || "")}`];
    case "rec":
      return [`<b>${who}</b> sent you ${ep}`, `${base}/episode/${n.episode_id}?from=${encodeURIComponent(n.actor?.handle || "")}`];
    case "comment":
      return [`<b>${who}</b> replied to your log of ${ep}: “${esc(n.body)}”`, thread(myHandle)];
    case "reply":
      return [`<b>${who}</b> replied on @${esc(n.owner?.handle)}'s log of ${ep}: “${esc(n.body)}”`, thread(n.owner?.handle)];
    case "reaction":
      return [`<b>${who}</b> reacted “${esc(words[n.body] || n.body)}” to your log of ${ep}`, thread(myHandle)];
    default:
      return null;
  }
}

export function digestEmail({ profile, notes, friendLogs, base }) {
  const notesHtml = notes
    .map((n) => noteLine(n, base, profile.handle))
    .filter(Boolean)
    .slice(0, 12)
    .map(([text, href]) => `<tr><td style="padding:10px 0;border-top:1px solid #eee"><a href="${href}" style="color:${C.ink};text-decoration:none;font-size:15px;line-height:1.4">${text}</a></td></tr>`)
    .join("");

  const logsHtml = friendLogs
    .slice(0, 8)
    .map((l) => {
      const href = `${base}/episode/${l.episode_id}?from=${encodeURIComponent(l.who.handle)}`;
      return `<tr><td style="padding:12px 0;border-top:1px solid #eee">
        <a href="${href}" style="color:${C.ink};text-decoration:none">
          <div style="font-size:13px;color:${C.muted}"><b style="color:${C.ink}">@${esc(l.who.handle)}</b> ${l.hooked ? "is hooked on" : "wasn't hooked by"}</div>
          <div style="font-size:16px;font-weight:700;margin-top:2px">${esc(l.title)}</div>
          <div style="font-size:13px;color:${C.muted}">${esc(l.feed_title || "")} <span style="color:${C.cobalt}">${stars(Number(l.rating))}</span></div>
          ${l.hook ? `<div style="font-size:14px;margin-top:4px">“${esc(l.hook)}”</div>` : ""}
        </a></td></tr>`;
    })
    .join("");

  const unsub = `${base}/api/unsubscribe?u=${profile.id}&t=${unsubToken(profile.id)}`;
  const count = notes.length + friendLogs.length;
  const subject =
    notes.length && notes[0].actor?.handle
      ? `@${notes[0].actor.handle} and more on Hooked on this week`
      : `${friendLogs.length} new logs from people you follow`;

  const html = `<!doctype html><html><body style="margin:0;background:${C.cream};font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream}"><tr><td align="center" style="padding:28px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <tr><td style="font-size:34px;font-weight:900;color:${C.cobalt};letter-spacing:-1px">hooked on</td></tr>
    <tr><td style="padding:4px 0 18px"><div style="height:8px;width:180px;border:2px solid ${C.ink};border-radius:99px;background:#fff"><div style="height:8px;width:62px;background:${C.pink};border-radius:99px"></div></div></td></tr>
    <tr><td style="font-size:22px;font-weight:800;padding-bottom:6px">Your week in podcasts${profile.display_name ? `, ${esc(profile.display_name.split(" ")[0])}` : ""}</td></tr>
    <tr><td style="font-size:15px;color:${C.muted};padding-bottom:18px">${count} things you might have missed.</td></tr>
    ${notesHtml ? `<tr><td style="background:#fff;border:3px solid ${C.ink};border-radius:20px;padding:6px 18px 8px"><table role="presentation" width="100%">${`<tr><td style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${C.cobalt};padding:10px 0 4px">For you</td></tr>` + notesHtml}</table></td></tr><tr><td style="height:16px"></td></tr>` : ""}
    ${logsHtml ? `<tr><td style="background:#fff;border:3px solid ${C.ink};border-radius:20px;padding:6px 18px 8px"><table role="presentation" width="100%">${`<tr><td style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${C.cobalt};padding:10px 0 4px">What your friends logged</td></tr>` + logsHtml}</table></td></tr>` : ""}
    <tr><td align="center" style="padding:24px 0"><a href="${base}" style="display:inline-block;background:${C.cobalt};color:#fff;font-weight:800;font-size:16px;text-decoration:none;padding:14px 28px;border-radius:99px;border:3px solid ${C.ink}">Open Hooked on</a></td></tr>
    <tr><td align="center" style="font-size:12px;color:${C.muted}">You get this weekly because you have a Hooked on profile. <a href="${unsub}" style="color:${C.muted}">Turn off weekly emails</a></td></tr>
  </table></td></tr></table></body></html>`;

  const text = `Your week on Hooked on\n\n${count} things you might have missed: ${base}\n\nTurn off weekly emails: ${unsub}`;
  return { subject, html, text, unsub };
}
