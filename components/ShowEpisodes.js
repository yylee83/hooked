"use client";
// Show pages' episode list controls (Erin, 2026-11-27): the Newest | Oldest switch's links, and "Hide logged".
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { noteReplace } from "./BackButton";
import { findLog, useStore } from "@/lib/store";

/** A sort link that swaps the page in place, so Back doesn't step through every toggle. */
export function SortLink({ href, on, children }) {
  return (
    <Link href={href} replace scroll={false} onClick={noteReplace} className={on ? "is-on" : ""} aria-current={on ? "true" : undefined}>
      {children}
    </Link>
  );
}

// ---------- Hide logged ----------
// Remembered on this device for every show, like Apple's "hide played". Only signed in: logs live in your account.
const KEY = "hooked:hide-logged";
const EVENT = "hooked:hide-logged";
const readHide = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};
const subscribe = (fn) => {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => (window.removeEventListener(EVENT, fn), window.removeEventListener("storage", fn));
};
function setHide(on) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Is "Hide logged" on and does it apply (signed in)? */
function useHiding() {
  const state = useStore();
  const on = useSyncExternalStore(subscribe, readHide, () => false);
  return { state, on: on && !!state?.user };
}

/** The toggle, and when on, how many are hidden. Nothing unless you're signed in and logged one of these episodes. */
export function HideLoggedControl({ episodes }) {
  const { state, on } = useHiding();
  if (!state?.user) return null;
  const logged = episodes.filter((e) => findLog(state, e)).length;
  if (!logged) return null;
  return (
    <div className="show-eps__hide">
      <button type="button" className={`show-eps__toggle ${on ? "is-on" : ""}`} aria-pressed={on} onClick={() => setHide(!on)}>
        {on ? "✓ Hiding logged" : "Hide logged"}
      </button>
      {on && (
        <p className="muted small show-eps__hidden" role="status">
          {logged === 1 ? "1 logged episode hidden" : `${logged} logged episodes hidden`}
          {logged === episodes.length ? " (every one on this page)" : ""} ·{" "}
          <button type="button" className="link-btn small" onClick={() => setHide(false)}>
            Show
          </button>
        </p>
      )}
    </div>
  );
}

/** One episode row; hides itself when "Hide logged" is on and you've logged it. */
export function ShowEpisodeRow({ episode, className, children }) {
  const { state, on } = useHiding();
  if (on && findLog(state, episode)) return null;
  return <li className={className}>{children}</li>;
}
