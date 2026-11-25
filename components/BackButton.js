"use client";
// "← Back" that goes back to the screen you were on (Erin, 2026-11-24). The browser knows where you came from, the
// server doesn't, so the earlier fixed links (a show's Back always went to Search) couldn't. If there's no earlier
// Hooked screen in this tab (you opened a shared link, or a new tab), "back" would leave Hooked, so it goes to
// `fallback` instead: the page it always went to.
//
// Next.js rewrites the browser's history entries, so we can't mark them. Instead BackTracker (in the root layout)
// keeps the trail of screens visited in this tab, in sessionStorage so a reload keeps it.
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const KEY = "hooked:trail";
const MAX = 50;

const here = () => window.location.pathname + window.location.search;

function read() {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) || "[]");
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

function write(t) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(t.slice(-MAX)));
  } catch {}
}

let started = false; // first screen of this page load
// Going to a fallback replaces the current screen instead of adding one, so the fallback page has nothing Hooked
// behind it. Otherwise an episode opened from a link sends you to its show, and the show's Back sends you back to the
// episode, round and round (Erin, 2026-11-25).
let replacing = false;
function toFallback(router, fallback) {
  replacing = true;
  router.replace(fallback || "/");
}

/** Records each screen. Going back to the screen before (Back, or the browser's back) takes the last one off. */
export function BackTracker() {
  const path = usePathname();
  const search = useSearchParams()?.toString();
  useEffect(() => {
    const now = here();
    let t = read();
    if (!started) {
      started = true;
      // A reload keeps the trail; arriving any other way starts a new one.
      if (t[t.length - 1] !== now) t = [now];
    } else if (replacing) {
      replacing = false;
      t[t.length - 1] = now;
    } else if (t[t.length - 1] === now) {
      return;
    } else if (t[t.length - 2] === now) {
      t.pop();
    } else {
      t.push(now);
    }
    write(t);
  }, [path, search]);
  return null;
}

/** Is there an earlier Hooked screen to go back to in this tab? */
export const canGoBack = () => typeof window !== "undefined" && read().length > 1;

/** Go back a screen, or to `fallback` when there's none. */
export function useGoBack(fallback) {
  const router = useRouter();
  return () => (canGoBack() ? router.back() : toFallback(router, fallback));
}

export default function BackButton({ fallback, children = "← Back" }) {
  const router = useRouter();
  // A real link to the fallback, so it works before the page's code loads. Once it has: back a screen if there's one,
  // else to the fallback in place of this screen.
  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (canGoBack()) router.back();
    else toFallback(router, fallback);
  };
  return (
    <Link href={fallback} className="back" onClick={onClick}>
      {children}
    </Link>
  );
}
