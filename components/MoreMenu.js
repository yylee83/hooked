"use client";
// The small "…" next to someone's review, reply, list or profile: Report it, or Block the person.
// Only for people signed in, and never on your own things. Opens a sheet from the bottom, like "Add to a list".
import { useEffect, useState } from "react";
import { block, isBlocked, unblock, useStore } from "@/lib/store";
import { REPORT_REASONS, sendReport } from "@/lib/report-client";
import { haptic } from "@/lib/haptics";

const NOUN = { review: "review", reply: "reply", list: "list", profile: "profile" };

// person: { id, handle }. what: { kind, userId, episodeRef, commentId, briefId } (see lib/report-client.js).
export default function MoreMenu({ person, what, className = "" }) {
  const state = useStore();
  const [open, setOpen] = useState(false);
  if (!state?.user || !person?.id || state.user.id === person.id) return null;
  return (
    <>
      <button
        type="button"
        className={`more-menu ${className}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          haptic();
          setOpen(true);
        }}
        aria-label={`More options for this ${NOUN[what?.kind] || "post"}`}
        aria-haspopup="dialog"
        title="More"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {open && <MoreSheet person={person} what={what} blocked={isBlocked(state, person.id)} onClose={() => setOpen(false)} />}
    </>
  );
}

function MoreSheet({ person, what, blocked, onClose }) {
  const [step, setStep] = useState("menu"); // menu → report → reported, or menu → block → blocked
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noun = NOUN[what?.kind] || "post";
  const who = `@${person.handle || "this person"}`;

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn, next) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setStep(next);
    } catch (e) {
      setError(e?.message || "Something went wrong. Try again.");
    }
    setBusy(false);
  }

  const close = (
    <button className="mini__close" onClick={onClose} aria-label="Close">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </button>
  );

  return (
    <div className="plus-sheet more-sheet" role="dialog" aria-modal="true" aria-label="More options" onClick={onClose}>
      <div className="plus-sheet__panel" onClick={(e) => e.stopPropagation()}>
        {step === "menu" && (
          <>
            <div className="more-sheet__head">
              <p className="more-sheet__title">{what?.kind === "profile" ? who : `${who}'s ${noun}`}</p>
              {close}
            </div>
            <ul className="more-sheet__list">
              <li>
                <button className="more-sheet__row" onClick={() => setStep("report")}>
                  Report {what?.kind === "profile" ? who : `this ${noun}`}
                </button>
              </li>
              <li>
                {blocked ? (
                  <button className="more-sheet__row" disabled={busy} onClick={() => run(() => unblock(person), "unblocked")}>
                    {busy ? "Unblocking…" : `Unblock ${who}`}
                  </button>
                ) : (
                  <button className="more-sheet__row more-sheet__row--warn" onClick={() => setStep("block")}>
                    Block {who}
                  </button>
                )}
              </li>
            </ul>
          </>
        )}

        {step === "report" && (
          <>
            <div className="more-sheet__head">
              <p className="more-sheet__title">Why are you reporting this?</p>
              {close}
            </div>
            <div className="more-sheet__reasons" role="radiogroup" aria-label="Reason">
              {REPORT_REASONS.map((r) => (
                <label key={r.id} className={`more-sheet__reason ${reason === r.id ? "is-on" : ""}`}>
                  <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  {r.label}
                </label>
              ))}
            </div>
            <textarea
              className="input more-sheet__note"
              placeholder="Anything else we should know? (optional)"
              value={note}
              maxLength={500}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Anything else we should know"
            />
            <p className="small muted more-sheet__fine">Only the Hooked team sees reports. {person.handle ? `@${person.handle}` : "They"} won&apos;t know it was you.</p>
            <button className="btn btn--cobalt btn--shadow-sm" disabled={!reason || busy} onClick={() => run(() => sendReport(what, reason, note), "reported")}>
              {busy ? "Sending…" : "Send report"}
            </button>
          </>
        )}

        {step === "block" && (
          <>
            <div className="more-sheet__head">
              <p className="more-sheet__title">Block {who}?</p>
              {close}
            </div>
            <p className="more-sheet__text">
              You won&apos;t see their reviews or replies. They can&apos;t follow you, reply to your reviews or send you episodes, and you&apos;ll
              stop following each other. They won&apos;t be told.
            </p>
            <div className="row gap">
              <button className="btn btn--ink btn--shadow-sm" disabled={busy} onClick={() => run(() => block(person), "blocked")}>
                {busy ? "Blocking…" : "Block"}
              </button>
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "reported" && (
          <>
            <div className="more-sheet__head">
              <p className="more-sheet__title">Thanks for telling us.</p>
              {close}
            </div>
            <p className="more-sheet__text">We&apos;ll take a look. {blocked ? "" : `You can also block ${who} so you don't see them.`}</p>
            {!blocked && (
              <div className="row gap">
                <button className="btn btn--shadow-sm" onClick={() => setStep("block")}>
                  Block {who}
                </button>
                <button className="btn btn--cobalt btn--shadow-sm" onClick={onClose}>
                  Done
                </button>
              </div>
            )}
            {blocked && (
              <button className="btn btn--cobalt btn--shadow-sm" onClick={onClose}>
                Done
              </button>
            )}
          </>
        )}

        {(step === "blocked" || step === "unblocked") && (
          <>
            <div className="more-sheet__head">
              <p className="more-sheet__title">{step === "blocked" ? `${who} is blocked.` : `${who} is unblocked.`}</p>
              {close}
            </div>
            <p className="more-sheet__text">
              {step === "blocked"
                ? `You won't see their reviews or replies. To undo it, open ${who}'s profile and tap “…”.`
                : "Their reviews and replies show up again. Follow them again if you'd like."}
            </p>
            <button className="btn btn--cobalt btn--shadow-sm" onClick={onClose}>
              Done
            </button>
          </>
        )}

        {error && <p className="nudge small">{error}</p>}
      </div>
    </div>
  );
}

// On the profile of someone you blocked: say so, with the way back.
export function BlockedNote({ person }) {
  const state = useStore();
  if (!isBlocked(state, person.id)) return null;
  return (
    <p className="blocked-note">
      You blocked @{person.handle}. Their reviews and replies are hidden from you. To unblock, tap “…” above.
    </p>
  );
}
