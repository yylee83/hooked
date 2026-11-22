"use client";
// Share an episode: send it to friends inside the app, or anywhere else with a link
// that opens a no-login page with your review on it.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import { findLog, sendRecommendation, useStore } from "@/lib/store";
import { episodeHref } from "@/lib/addresses";
import { site } from "@/lib/site";
import { recordShare } from "@/lib/history";
import { briefPreviewPath, episodePreviewPath, warmPreview } from "@/lib/og-paths";

export function starText(rating) {
  if (!rating) return "";
  return "★".repeat(Math.floor(rating)) + (rating % 1 ? "½" : "");
}

export function shareText(ep, review) {
  let text = `I thought you would enjoy this podcast: "${ep.title}"${ep.feedTitle ? ` from ${ep.feedTitle}` : ""}.`;
  if (review) {
    const take = [starText(review.rating), review.hook ? `"${review.hook}"` : ""].filter(Boolean).join(" ");
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

  const mine = findLog(state, episode);
  const review = mine ? { rating: mine.rating, hook: mine.hook } : null;
  const handle = state?.profile?.handle;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // Our short address when we know it; otherwise the Podcast Index number, which redirects to it.
  const url = `${origin}${episodeHref(episode.ref, episode.id)}${handle ? `?from=${encodeURIComponent(handle)}` : ""}`;
  const text = shareText(episode, review);
  const full = `${text}\n${url}`;
  const enc = encodeURIComponent;

  // Each way of sharing outside Hooked is saved for the team and counts in trending (lib/history.js, recordShare).
  const withReview = !!(review && (review.rating > 0 || review.hook));
  const noteShare = (method) => recordShare({ ep: episode, method, withReview });

  async function nativeShare() {
    try {
      await navigator.share({ title: `${episode.title} · ${site.name}`, text, url });
      noteShare("share_menu"); // only once the share went through (closing the menu throws)
    } catch {}
  }

  // "Copy link" copies just the address. Share…, Messages, Email and the rest send the message with it.
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      noteShare("copy");
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

  // Get the link's preview picture drawn now, so it's ready when Messages (or anything else) asks for it. A phone
  // gives up after a few seconds and shows only a small icon.
  useEffect(() => {
    if (episode.ref) warmPreview(episodePreviewPath(episode.ref, handle));
  }, [episode.ref, handle]);

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
            <a className="share-opt" href={`sms:?&body=${enc(full)}`} onClick={() => noteShare("messages")}>
              Messages
            </a>
            <a className="share-opt" href={`mailto:?subject=${enc(`A podcast for you: ${episode.title}`)}&body=${enc(full)}`} onClick={() => noteShare("email")}>
              Email
            </a>
            <a className="share-opt" href={`https://wa.me/?text=${enc(full)}`} target="_blank" rel="noopener noreferrer" onClick={() => noteShare("whatsapp")}>
              WhatsApp
            </a>
            <a className="share-opt" href={`https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`} target="_blank" rel="noopener noreferrer" onClick={() => noteShare("x")}>
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

// Share a brief. On phones this opens the phone's own share menu (Messages, WhatsApp, Mail…);
// where there isn't one (most computers), a small sheet with Copy link and a few apps.
// The link opens the brief for anyone, signed in or not.
export function BriefShareButton({ title, path, count, briefId }) {
  const [open, setOpen] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}${path}`;
  const text = `A podcast brief for you: "${title}"${count ? `, ${count} ${count === 1 ? "episode" : "episodes"}` : ""}.`;

  // The phone's share menu opens straight away, so get the preview picture ready while the page is open: a phone gives
  // up on a slow one after a few seconds and shows only a small icon.
  useEffect(() => {
    const key = path.split("?")[0].split("/").filter(Boolean).pop();
    const t = setTimeout(() => warmPreview(briefPreviewPath(key)), 2000);
    return () => clearTimeout(t);
  }, [path]);

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: `${title} · ${site.name}`, text, url });
        recordShare({ briefId, method: "share_menu" });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return; // they closed the menu
      }
    }
    setOpen(true);
  }

  return (
    <>
      <button type="button" className="btn btn--sm brief-share" onClick={share}>
        <ShareIcon size={15} />
        Share
      </button>
      {open && (
        <LinkSheet
          title="Share this brief"
          url={url}
          text={text}
          subject={`A podcast brief for you: ${title}`}
          onShare={(method) => recordShare({ briefId, method })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// Copy link, Messages, Email, WhatsApp and X for a link.
function LinkSheet({ title, url, text, subject, onShare = () => {}, onClose }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const full = `${text}\n${url}`;
  const enc = encodeURIComponent;

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onShare("copy");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Press and hold the link to copy it.");
    }
  }

  return (
    <div className="plus-sheet share-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="plus-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="row center" style={{ justifyContent: "space-between" }}>
          <p className="display plus-sheet__title" style={{ margin: 0 }}>{title}</p>
          <button className="mini__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="muted small">Anyone with the link can open it and listen. No sign-up needed.</p>
        <div className="share-grid">
          <button className="share-opt share-opt--main" onClick={copy}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <a className="share-opt" href={`sms:?&body=${enc(full)}`} onClick={() => onShare("messages")}>
            Messages
          </a>
          <a className="share-opt" href={`mailto:?subject=${enc(subject)}&body=${enc(full)}`} onClick={() => onShare("email")}>
            Email
          </a>
          <a className="share-opt" href={`https://wa.me/?text=${enc(full)}`} target="_blank" rel="noopener noreferrer" onClick={() => onShare("whatsapp")}>
            WhatsApp
          </a>
        </div>
        <p className="share-preview">{full}</p>
        {error && <p className="nudge small">{error}</p>}
      </div>
    </div>
  );
}
