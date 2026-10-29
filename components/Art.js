"use client";
import { useState } from "react";
import Link from "next/link";

const tones = ["var(--butter)", "var(--bubblegum)", "var(--cobalt)"];

// Podcast cover art, with a friendly stand-in if the image is missing or broken.
// Pass episodeId to make the cover open that episode, or feedId to open the show.
export default function Art({ src, title = "", size = 64, tilt = 0, radius, className = "", feedId, episodeId }) {
  const [broken, setBroken] = useState(false);
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
    // eslint-disable-next-line @next/next/no-img-element
    art = <img className={`art ${className}`} style={style} src={src} alt={title} loading="lazy" onError={() => setBroken(true)} />;
  }
  const href = episodeId ? `/episode/${episodeId}` : feedId ? `/show/${feedId}` : null;
  if (!href) return art;
  return (
    <Link href={href} className="art-link" aria-label={episodeId ? "Open episode" : title ? `Go to ${title}` : "Go to show"}>
      {art}
    </Link>
  );
}
