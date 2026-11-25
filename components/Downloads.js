"use client";
// Downloads (YY, 2026-11-25): the "Download" button on episode pages, the Downloads list in My log → Up next, and
// the bit in the root layout that starts the service worker. How saving works: lib/downloads.js.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import Art from "./Art";
import { PlayButton } from "./Player";
import { canDownload, checkDownloads, downloadEpisode, downloadState, removeDownload, sizeText, useDownloads } from "@/lib/downloads";
import { episodeHref } from "@/lib/addresses";
import { haptic } from "@/lib/haptics";

// Starts public/sw.js once the page has loaded, and forgets downloads the browser has since cleared.
export function DownloadsSetup() {
  useEffect(() => {
    if (!canDownload()) return;
    const start = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      checkDownloads();
    };
    if (document.readyState === "complete") start();
    else {
      window.addEventListener("load", start, { once: true });
      return () => window.removeEventListener("load", start);
    }
  }, []);
  return null;
}

function DownloadIcon({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

const noop = () => () => {};

const WHY = {
  blocked: "This show's host doesn't allow saving. It still plays when you're online.",
  full: "Your phone is out of room for downloads.",
};

export function DownloadButton({ episode }) {
  const dl = useDownloads();
  const ok = useSyncExternalStore(noop, canDownload, () => false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 4000);
    return () => clearTimeout(t);
  }, [confirm]);
  if (!ok || !episode?.audio) return null;
  const s = downloadState(dl, episode);

  function tap() {
    haptic();
    if (s.state === "saved") {
      if (confirm) {
        removeDownload(episode);
        setConfirm(false);
      } else setConfirm(true);
      return;
    }
    downloadEpisode(episode);
  }

  const label =
    s.state === "saving" ? (s.pct ? `Saving ${s.pct}%` : "Saving…") : s.state === "saved" ? (confirm ? "Remove download?" : "✓ Downloaded") : s.state === "error" ? "Can't save this one" : "Download";

  return (
    <span className="dl-wrap">
      <button
        type="button"
        className={`btn btn--sm ${s.state === "saved" ? "btn--butter" : ""} ${s.state === "saving" ? "dl-btn--saving" : ""}`}
        style={s.state === "saving" ? { "--dl-pct": `${s.pct || 0}%` } : undefined}
        onClick={tap}
        aria-label={s.state === "saving" ? `${label}. Tap to stop.` : undefined}
      >
        {s.state !== "saved" && s.state !== "error" && <DownloadIcon />}
        {label}
      </button>
      {s.state === "error" && <span className="dl-why muted small">{WHY[s.why] || WHY.blocked}</span>}
    </span>
  );
}

// The number on My log's Downloads tab.
export function DownloadCount() {
  const n = Object.keys(useDownloads().saved).length;
  return n > 0 ? <span className="me-sections__n">{n}</span> : null;
}

// My log → Downloads: what's saved on this device, newest first, with how much room each takes.
export function DownloadsList() {
  const dl = useDownloads();
  const rows = Object.values(dl.saved).sort((a, b) => b.at - a.at);
  if (!rows.length)
    return (
      <section className="empty card" style={{ marginTop: 16 }}>
        <p className="display h-md">Nothing downloaded yet.</p>
        <p className="muted">Tap Download on any episode to play it on the subway, on a plane, anywhere with no signal. Downloads stay in the browser you save them in.</p>
        <Link className="btn btn--cobalt btn--shadow-sm" href="/search">
          Find something
        </Link>
      </section>
    );
  const total = rows.reduce((n, r) => n + (r.size || 0), 0);
  return (
    <section className="dl-list">
      <p className="muted small dl-list__note">
        Saved in this browser on this device, to play with no signal · <span className="mono">{sizeText(total)}</span>
      </p>
      <ul className="dl-list__rows">
        {rows.map((r) => (
          <li key={r.key} className="list__row">
            <Art src={r.image} title={r.feedTitle} size={48} radius={10} episodeRef={r.ref} episodeId={r.id} />
            <div className="min0 grow">
              <Link href={episodeHref(r.ref, r.id)} className="title-sm">
                {r.title}
              </Link>
              <p className="muted small">
                {r.feedTitle}
                {r.size ? ` · ${sizeText(r.size)}` : ""}
              </p>
            </div>
            <div className="upnext__actions">
              <PlayButton episode={r} />
              <button className="link-btn small" onClick={() => removeDownload(r)} aria-label={`Remove the download of ${r.title}`}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
