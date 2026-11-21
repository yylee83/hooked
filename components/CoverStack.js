"use client";
// Up to three covers, overlapping and slightly tilted, inside a brief card. A cover that fails to load is left out and
// the next one takes its place, so a card never shows a broken-image icon (YY, 2026-11-21).
import { useState } from "react";

export default function CoverStack({ covers = [] }) {
  const [failed, setFailed] = useState(() => new Set());
  const drop = (src) => setFailed((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  const list = [...new Set(covers.filter(Boolean))].filter((src) => !failed.has(src)).slice(0, 3);
  if (!list.length) return <span className="cover-stack cover-stack--empty" aria-hidden="true" />;
  return (
    <span className="cover-stack" aria-hidden="true">
      {list.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          className={`cover-stack__img cover-stack__img--${i}`}
          loading="lazy"
          onError={() => drop(src)}
          // An image can fail before the page comes alive (onError isn't listening yet), so check once it is.
          ref={(img) => {
            if (img && img.complete && img.naturalWidth === 0) drop(src);
          }}
        />
      ))}
    </span>
  );
}
