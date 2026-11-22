"use client";
import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import PasteLink from "./PasteLink";

const tabs = [
  { href: "/", label: "Home" },
  { href: "/briefs", label: "Lists" },
  { plus: true },
  { href: "/search", label: "Search" },
  { href: "/me", label: "My log" },
];

// A tab's name turns blue the moment it's tapped, even while a slower page (Search) is still loading, so a tap never
// looks ignored (YY, 2026-11-21: "sometimes hitting Search doesn't work").
function NavLabel({ children }) {
  const { pending } = useLinkStatus();
  return <span className={`nav__label ${pending ? "is-pending" : ""}`}>{children}</span>;
}

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
        <Link href="/search/find?type=episodes" className="plus-option tone-cobalt" onClick={onClose}>
          <span className="display">Log a review</span>
          <span>Find an episode, rate it, say what you thought.</span>
        </Link>
        <PasteLink onDone={onClose} />
        <Link href="/briefs/new" className="plus-option tone-bubblegum" onClick={onClose}>
          <span className="display">Make a list</span>
          <span>Pick a topic. We'll find the best episodes about it.</span>
        </Link>
        <button className="link-btn" style={{ marginTop: 6 }} onClick={onClose}>
          Never mind
        </button>
      </div>
    </div>
  );
}

// Keeps the bars pinned to the bottom (this nav, the mini player) at the bottom of what's actually on screen.
// On iPhone (seen on iOS 26, opened from the Home Screen), after the keyboard closes Safari can keep laying out
// the page as if it were still open, so bottom-pinned bars sit a keyboard's height up the screen. The browser's
// visual viewport says where the visible area really ends: --vv-shift moves the bars there (globals.css).
// While the keyboard is up, the nav steps aside (html.keyboard-open) instead of riding up on it.
const TEXT_INPUT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="range"]), textarea, select, [contenteditable="true"], [contenteditable=""]';

const STUCK = 150; // px: bigger than Safari's toolbars, smaller than any keyboard

function useBottomPinned() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const typing = () => !!document.activeElement?.matches?.(TEXT_INPUT);
    // A focused box isn't enough (Search focuses its own box, and iPhone doesn't open the keyboard for that): the
    // keyboard is up when the visible area has also shrunk by a keyboard's height.
    const keyboardUp = () => typing() && !!vv && window.innerHeight - (vv.offsetTop + vv.height) > STUCK;
    const update = () => {
      root.classList.toggle("keyboard-open", keyboardUp());
      if (!vv || Math.abs(vv.scale - 1) > 0.01) return root.style.removeProperty("--vv-shift"); // zoomed in: leave it
      // How far below the bars' spot the visible area really ends. Only a gap the size of a keyboard counts: the
      // address bar growing and shrinking while you scroll makes small, passing gaps the bars shouldn't chase.
      const shift = Math.round(vv.offsetTop + vv.height - window.innerHeight);
      if (shift > STUCK) root.style.setProperty("--vv-shift", `${shift}px`);
      else root.style.removeProperty("--vv-shift");
    };
    // After the keyboard closes iOS settles over a few hundred milliseconds: look again, and nudge it to lay out.
    const timers = [];
    const afterTyping = () => {
      update();
      for (const ms of [100, 400]) timers.push(setTimeout(() => (typing() ? null : (window.scrollTo(window.scrollX, window.scrollY), update())), ms));
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", afterTyping);
    window.addEventListener("pageshow", update);
    return () => {
      timers.forEach(clearTimeout);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", afterTyping);
      window.removeEventListener("pageshow", update);
    };
  }, []);
}

export default function BottomNav() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useBottomPinned();
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
                <NavLabel>{t.label}</NavLabel>
              </Link>
            )
          )}
        </div>
      </nav>
      {open && <PlusSheet onClose={() => setOpen(false)} />}
    </>
  );
}
