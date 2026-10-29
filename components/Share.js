"use client";
// Share an episode: send it to friends inside the app, or anywhere else with a link
// that opens a no-login page with your review on it.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import { sendRecommendation, useStore } from "@/lib/store";
import { site } from "@/lib/site";

export function starText(rating) {
  if (!rating) return "";
  return "★".repeat(Math.floor(rating)) + (rating % 1 ? "½" : "");
}

export function shareText(ep, review) {
  let text = `I thought you would enjoy this podcast: "${ep.title}"${ep.feedTitle ? ` from ${ep.feedTitle}` : ""}.`;
  if (review) {
    const take = [starText(review.rating), review.hook ? `"${review.hook}"` : review.hooked ? "I'm hooked." : ""].filter(Boolean).join(" ");
    if (take) text += ` My take: ${take}`;
  }
  return text;
}

function ShareIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export function ShareButton({ episode, compact = false, label = "Share" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={compact ? "share-icon" : "btn btn--sm"}
        onClick={() => setOpen(true)}
        aria-label={compact ? `Share ${episode.title}` : undefined}
        title={compact ? "Share" : undefined}
      >
        <ShareIcon size={compact ? 18 : 15} />
        {!compact && label}
      </button>
      {open && <ShareSheet episode={episode} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ShareSheet({ episode, onClose }) {
  const state = useStore();
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const mine = state?.logs?.find((l) => String(l.id) === String(episode.id));
  const review = mine ? { hooked: mine.hooked, rating: mine.rating, hook: mine.hook } : null;
  const handle = state?.profile?.handle;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/episode/${episode.id}${handle ? `?from=${encodeURIComponent(handle)}` : ""}`;
  const text = shareText(episode, review);
  const full = `${text}\n${url}`;
  const enc = encodeURIComponent;

  async function nativeShare() {
    try {
      await navigator.share({ title: `${episode.title} · ${site.name}`, text, url });
    } catch {}
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  async function send() {
    setSending(true);
    setError("");
    try {
      const ids = state.following.filter((f) => picked.includes(f.id)).map((f) => f.id);
      await sendRecommendation(ids, episode, { note, review });
      const names = state.following.filter((f) => picked.includes(f.id)).map((f) => `@${f.handle}`);
      setSent(`Sent to ${names.join(", ")}.`);
      setPicked([]);
      setNote("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const canNative = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="plus-sheet share-sheet" role="dialog" aria-modal="true" aria-label="Share" onClick={onClose}>
      <div className="plus-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="row center" style={{ justifyContent: "space-between" }}>
          <p className="display plus-sheet__title" style={{ margin: 0 }}>Share it</p>
          <button className="mini__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="share-ep">
          <Art src={episode.image} title={episode.feedTitle || ""} size={64} radius={12} />
          <div className="min0">
            <p className="title-sm">{episode.title}</p>
            <p className="muted small">{episode.feedTitle}</p>
            {review && (review.rating > 0 || review.hook) && (
              <p className="small row gap-xs center wrap" style={{ marginTop: 4 }}>
                <span className="mono" style={{ fontSize: 11 }}>Your take:</span>
                {review.rating > 0 && <Stars value={review.rating} size={14} />}
                {review.hook && <span className="share-hook">“{review.hook}”</span>}
              </p>
            )}
          </div>
        </div>

        <section className="share-section">
          <p className="label" style={{ margin: "0 0 10px" }}>Send in {site.name}</p>
          {!state?.user ? (
            <p className="muted small">
              <Link href="/login" className="u-link" onClick={onClose}>
                Sign in
              </Link>{" "}
              to send to friends here.
            </p>
          ) : !state.following?.length ? (
            <p className="muted small">
              Follow friends to send them episodes.{" "}
              <Link href="/people" className="u-link" onClick={onClose}>
                Find friends
              </Link>
            </p>
          ) : (
            <>
              <div className="row gap-xs wrap">
                {state.following.map((f) => {
                  const on = picked.includes(f.id);
                  return (
                    <button key={f.id} className={`chip chip--sm ${on ? "chip--on" : ""}`} onClick={() => setPicked(on ? picked.filter((x) => x !== f.id) : [...picked, f.id])} aria-pressed={on}>
                      @{f.handle}
                    </button>
                  );
                })}
              </div>
              {picked.length > 0 && (
                <>
                  <input className="input" style={{ marginTop: 12 }} placeholder="Add a note (optional)" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className="btn btn--cobalt btn--shadow-sm" style={{ marginTop: 12 }} onClick={send} disabled={sending}>
                    {sending ? "Sending…" : `Send to ${picked.length}`}
                  </button>
                </>
              )}
              {sent && <p className="share-ok">{sent}</p>}
            </>
          )}
        </section>

        <section className="share-section">
          <p className="label" style={{ margin: "0 0 4px" }}>Share anywhere</p>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Opens a page where anyone can listen{review ? " and see your review" : ""}. No sign-up needed.
          </p>
          <div className="share-grid">
            {canNative && (
              <button className="share-opt share-opt--main" onClick={nativeShare}>
                Share…
              </button>
            )}
            <button className="share-opt" onClick={copy}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <a className="share-opt" href={`sms:?&body=${enc(full)}`}>
              Messages
            </a>
            <a className="share-opt" href={`mailto:?subject=${enc(`A podcast for you: ${episode.title}`)}&body=${enc(full)}`}>
              Email
            </a>
            <a className="share-opt" href={`https://wa.me/?text=${enc(full)}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <a className="share-opt" href={`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`} target="_blank" rel="noopener noreferrer">
              X
            </a>
          </div>
          <p className="share-preview">{full}</p>
          {error && <p className="nudge small">{error}</p>}
        </section>
      </div>
    </div>
  );
}
