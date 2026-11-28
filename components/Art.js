"use client";
import { useState } from "react";
import Link from "next/link";
import { episodeHref, showHref } from "@/lib/addresses";
import { smallCover } from "@/lib/cover";

const tones = ["var(--butter)", "var(--bubblegum)", "var(--cobalt)"];

// Podcast cover art, with a friendly stand-in if the image is missing or broken.
// Pass episodeRef/episodeId to make the cover open that episode, or showRef/feedId to open the show.
// (Refs are our short ids; the Podcast Index numbers still work and redirect.)
export default function Art({ src, title: rawTitle, size = 64, tilt = 0, radius, className = "", feedId, episodeId, showRef, episodeRef }) {
  // 0: the small copy (lib/cover.js), 1: the original, if the small copy failed, 2: broken (the stand-in).
  const [stage, setStage] = useState(0);
  const broken = stage === 2;
  // Saved rows can have no title (null), not just a missing one; never let that break the page.
  const title = typeof rawTitle === "string" ? rawTitle : "";
  const style = {
    width: size,
    height: size,
    borderRadius: radius ?? Math.max(10, Math.round(size / 7)),
    transform: tilt ? `rotate(${tilt}deg)` : undefined,
  };
  let art;
  if (!src || broken) {
    const tone = tones[(title.charCodeAt(0) || 0) % tones.length];
    art = (
      <div
        className={`art art--empty ${className}`}
        style={{ ...style, background: tone, color: tone === "var(--cobalt)" ? "#fff" : "var(--ink)", fontSize: typeof size === "number" ? size * 0.45 : 44 }}
        aria-label={title}
      >
        {(title.trim()[0] || "h").toLowerCase()}
      </div>
    );
  } else {
    // Fluid covers ("100%") fill a card, at most about 200px wide on a phone.
    const small = smallCover(src, typeof size === "number" ? size : 200);
    const shown = stage === 0 ? small : src;
    const failed = () => setStage((s) => (s === 0 && small !== src ? 1 : 2));
    art = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={shown}
        className={`art ${className}`}
        style={style}
        src={shown}
        alt={title}
        loading="lazy"
        onError={failed}
        // An image can fail before the page comes alive (onError isn't listening yet), so check once it is.
        ref={(img) => {
          if (img && img.complete && img.naturalWidth === 0 && img.currentSrc) failed();
        }}
      />
    );
  }
  const toEpisode = episodeRef || episodeId;
  const href = toEpisode ? episodeHref(episodeRef, episodeId) : showRef || feedId ? showHref(showRef, feedId) : null;
  if (!href) return art;
  return (
    <Link href={href} className="art-link" aria-label={toEpisode ? "Open episode" : title ? `Go to ${title}` : "Go to show"}>
      {art}
    </Link>
  );
}
