// Each new report is emailed to the team (hello@hookedonpods.com, or REPORTS_TO), one email per report, sent right
// after it's made (the app pings /api/report-email) with the daily notification catch-up as backup.
// Like other emails, only the live site sends to the real address; previews send to EMAIL_TEST_TO, or nowhere.
import "server-only";
import { esc, siteUrl } from "./digest";
import { deliverTo, emailReady, fromAddress, resend } from "./notify-email";

const REASONS = {
  spam: "Spam or selling something",
  harassment: "Bullying or harassment",
  hate: "Hate or slurs",
  sexual: "Sexual or graphic",
  spoilers: "Spoilers without warning",
  other: "Something else",
};
const KINDS = { review: "a review", reply: "a reply", list: "a list", profile: "a profile" };

function reportEmail(r, base) {
  const link = `${base}${r.link || ""}`;
  const what = KINDS[r.kind] || r.kind;
  const subject = `Report: ${what} by @${r.reported_handle || "someone"} (${REASONS[r.reason] || r.reason})`;
  const rows = [
    ["What", what],
    ["Written by", `@${r.reported_handle || "?"}`],
    ["Reason", REASONS[r.reason] || r.reason],
    ["Reported by", r.reporter?.handle ? `@${r.reporter.handle}` : "?"],
    ["Their note", r.note || ""],
    [r.kind === "profile" ? "Name" : "The words", r.content || "(no words, just stars)"],
  ].filter(([, v]) => v);
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#FFF7EE;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15131D">
  <div style="max-width:520px;margin:0 auto">
  <p style="font-size:18px;font-weight:800;margin:0 0 14px">Someone reported ${esc(what)} on Hooked</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fff;border:3px solid #15131D;border-radius:16px;padding:8px 14px">
  ${rows.map(([k, v]) => `<tr><td style="padding:7px 10px 7px 0;color:#55526A;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;font-size:15px;line-height:1.4">${esc(v)}</td></tr>`).join("")}
  </table>
  <p style="margin:20px 0"><a href="${link}" style="display:inline-block;background:#2340FF;color:#fff;font-weight:800;text-decoration:none;padding:11px 22px;border-radius:99px;border:3px solid #15131D">See it on Hooked</a></p>
  <p style="font-size:13px;color:#55526A;line-height:1.5">All reports are in Supabase → Table Editor → insights_reports. How to remove something: docs/MODERATION.md in the repo.</p>
  </div></body></html>`;
  const text = `Someone reported ${what} on Hooked\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${link}\n\nAll reports: Supabase → Table Editor → insights_reports.`;
  return { subject, html, text };
}

// Email every report that hasn't been emailed yet (from the past 3 days). Returns how many went out.
export async function emailReports(db) {
  if (!emailReady()) return 0;
  const to = deliverTo(process.env.REPORTS_TO || "hello@hookedonpods.com");
  if (!to) return 0;
  const { data } = await db
    .from("reports")
    .select("id, kind, reason, note, reported_handle, content, link, reporter:profiles!reports_reporter_id_fkey(handle)")
    .is("emailed_at", null)
    .gte("created_at", new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString())
    .order("created_at", { ascending: true })
    .limit(20);
  const base = siteUrl();
  let sent = 0;
  for (const r of data || []) {
    // Claim it first, so two pings at once don't both send it.
    const { data: claimed } = await db.from("reports").update({ emailed_at: new Date().toISOString() }).eq("id", r.id).is("emailed_at", null).select("id");
    if (!claimed?.length) continue;
    const email = reportEmail(r, base);
    const ok = await resend({ from: fromAddress(), to, subject: email.subject, html: email.html, text: email.text });
    if (!ok) {
      await db.from("reports").update({ emailed_at: null }).eq("id", r.id);
      continue;
    }
    sent++;
    await new Promise((res) => setTimeout(res, 200));
  }
  return sent;
}
