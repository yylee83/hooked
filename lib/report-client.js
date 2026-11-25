"use client";
// Reporting a review, reply, list or person (supabase/migrations/20261124200000_reports_blocks.sql). The app sends
// only what was reported and why; the database fills in the words and the link, and the team is emailed
// (lib/report-email.js, through /api/report-email).
import { supabase } from "./supabase/client";

export const REPORT_REASONS = [
  { id: "spam", label: "Spam or selling something" },
  { id: "harassment", label: "Bullying or harassment" },
  { id: "hate", label: "Hate or slurs" },
  { id: "sexual", label: "Sexual or graphic" },
  { id: "spoilers", label: "Spoilers without warning" },
  { id: "other", label: "Something else" },
];

// what: { kind: "review" | "reply" | "list" | "profile", userId, episodeRef, commentId, briefId }
export async function sendReport(what, reason, note = "") {
  const db = supabase();
  if (!db) throw new Error("Reports aren't available right now.");
  const { error } = await db.from("reports").insert({
    kind: what.kind,
    reason,
    note: note.trim().slice(0, 500) || null,
    reported_user_id: what.userId || null,
    episode_ref: what.episodeRef || null,
    comment_id: what.commentId || null,
    brief_id: what.briefId || null,
  });
  if (error) {
    if (error.code === "HKR01" || error.code === "HKR02") throw new Error(error.message);
    throw new Error("Couldn't send the report. Try again.");
  }
  try {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (token) fetch("/api/report-email", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
  } catch {}
}
