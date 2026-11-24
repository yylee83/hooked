"use client";
// Home refreshes in place, like X (YY, 2026-11-22): tap Home on the bottom bar while on Home (it scrolls back to the
// top too), or pull the page down from the top and let go. A small round arrow slides in above the page and spins
// while Home asks again for each section; what's on screen stays until the new answer arrives (lib/home-refresh.js).
// Pulls that start on the player, the bottom bar, an open sheet, or inside Top conversations' own scrolled box are
// left alone, and sideways swipes (the card rows) never count.
import { useEffect, useRef, useState } from "react";
import { HOME_TAP, refreshHome } from "@/lib/home-refresh";
import { reloadStore } from "@/lib/store";
import { haptic } from "@/lib/haptics";

const READY = 64; // px pulled (after the drag's resistance) that refreshes on letting go
const HOLD = 46; // where the page sits while refreshing
const MAX = 110;
const SKIP = ".mini, .player-tab, .nav, [role='dialog'], [aria-modal='true'], input, textarea, select";

export default function HomeRefresh({ children }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    const root = document.documentElement;
    // Our pull replaces the browser's own (Android Chrome reloads the whole page; iPhone Safari too) and the bounce.
    root.classList.add("home-pull-on");
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const run = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setPull(HOLD);
      refreshHome();
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // Long enough to see it happened; never stuck if the network is slow (the sections fill in when they arrive).
      await Promise.race([Promise.all([reloadStore(), wait(700)]), wait(4000)]);
      busyRef.current = false;
      if (!alive) return;
      setBusy(false);
      setPull(0);
    };

    const onTap = () => {
      haptic();
      window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
      run();
    };

    let g = null; // the pull in progress
    const start = (e) => {
      g = null;
      if (busyRef.current || e.touches.length !== 1 || window.scrollY > 0) return;
      const t = e.target;
      if (t.closest?.(SKIP)) return;
      const box = t.closest?.(".featured-talk__row");
      if (box && box.scrollTop > 0) return;
      g = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: false, dist: 0 };
    };
    const move = (e) => {
      if (!g || e.touches.length !== 1) return;
      const { clientX, clientY } = e.touches[0];
      if (!g.on) {
        const dx = clientX - g.x;
        const dy = clientY - g.y;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) return (g = null);
        g.on = true;
        g.y = clientY; // start from here, so the arrow doesn't jump
        setDragging(true);
      }
      g.dist = Math.min(MAX, Math.max(0, clientY - g.y) * 0.5);
      setPull(g.dist);
    };
    const end = (e) => {
      if (!g) return;
      const go = e.type === "touchend" && g.on && g.dist >= READY;
      const was = g.on;
      g = null;
      if (!was) return;
      setDragging(false);
      if (go) {
        haptic();
        run();
      } else setPull(0);
    };

    window.addEventListener(HOME_TAP, onTap);
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      alive = false;
      root.classList.remove("home-pull-on");
      window.removeEventListener(HOME_TAP, onTap);
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  const shown = busy || pull > 0;
  return (
    <>
      <div
        className={`home-pull ${busy ? "is-busy" : ""} ${pull >= READY || busy ? "is-ready" : ""} ${dragging ? "is-dragging" : ""}`}
        style={{ "--pull": `${pull}px`, opacity: busy ? 1 : Math.min(1, pull / (READY * 0.7)), visibility: shown ? "visible" : "hidden" }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={busy ? undefined : { transform: `rotate(${pull * 3}deg)` }}>
          <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
          <path d="M19.5 3.8v3.6h-3.6" />
        </svg>
      </div>
      <span className="home-pull__status" role="status">{busy ? "Refreshing" : ""}</span>
      <div className={`home-pull__body ${dragging ? "is-dragging" : ""}`} style={pull ? { transform: `translateY(${pull}px)` } : undefined}>
        {children}
      </div>
    </>
  );
}
