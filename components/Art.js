"use client";
import { useState } from "react";

const tones = ["var(--butter)", "var(--bubblegum)", "var(--cobalt)"];

// Podcast cover art, with a friendly stand-in if the image is missing or broken.
export default function Art({ src, title = "", size = 64, tilt = 0, radius, className = "" }) {
  const [broken, setBroken] = useState(false);
  const style = {
    width: size,
    height: size,
    borderRadius: radius ?? Math.max(10, Math.round(size / 7)),
    transform: tilt ? `rotate(${tilt}deg)` : undefined,
  };
  if (!src || broken) {
    const tone = tones[(title.charCodeAt(0) || 0) % tones.length];
    return (
      <div
        className={`art art--empty ${className}`}
        style={{ ...style, background: tone, color: tone === "var(--cobalt)" ? "#fff" : "var(--ink)", fontSize: typeof size === "number" ? size * 0.45 : 44 }}
        aria-label={title}
      >
        {(title.trim()[0] || "h").toLowerCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`art ${className}`} style={style} src={src} alt={title} loading="lazy" onError={() => setBroken(true)} />
  );
}
