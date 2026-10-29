"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Home" },
  { href: "/briefs", label: "Briefs" },
  { plus: true },
  { href: "/search", label: "Search" },
  { href: "/me", label: "My log" },
];

// The + button: write a review, or make a brief.
function PlusSheet({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="plus-sheet" role="dialog" aria-modal="true" aria-label="Create" onClick={onClose}>
      <div className="plus-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <p className="display plus-sheet__title">What are we making?</p>
        <Link href="/search?type=episodes" className="plus-option tone-cobalt" onClick={onClose}>
          <span className="display">Log a review</span>
          <span>Find an episode, say if you're hooked, rate it, give the hook.</span>
        </Link>
        <Link href="/briefs/new" className="plus-option tone-bubblegum" onClick={onClose}>
          <span className="display">Make a brief</span>
          <span>Pick a topic. We'll pull the best episodes, or just the parts that mention it.</span>
        </Link>
        <button className="link-btn" style={{ marginTop: 6 }} onClick={onClose}>
          Never mind
        </button>
      </div>
    </div>
  );
}

export default function BottomNav() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (path.startsWith("/log/")) return null; // the Log it sheet is full-screen
  const active = (href) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <nav className="nav" aria-label="Main">
        <div className="nav__inner">
          {tabs.map((t) =>
            t.plus ? (
              <button key="plus" className={`nav__plus ${open ? "is-open" : ""}`} aria-label="Create" aria-expanded={open} onClick={() => setOpen(!open)}>
                <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                  <path d="M12 4v16M4 12h16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
                </svg>
              </button>
            ) : (
              <Link key={t.label} href={t.href} className={`nav__link ${active(t.href) ? "is-active" : ""}`}>
                {t.label}
              </Link>
            )
          )}
        </div>
      </nav>
      {open && <PlusSheet onClose={() => setOpen(false)} />}
    </>
  );
}
