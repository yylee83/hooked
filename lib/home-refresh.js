"use client";
// Refreshing Home in place (YY, 2026-11-22: "like X"): tapping Home on the bottom bar while on Home, or pulling the
// page down from the top (components/HomeRefresh.js). Each Home section that loads its own data adds the tick from
// useRefreshTick() to its loading effect, so a refresh asks again while what's on screen stays until the new answer
// arrives (no flash of empty placeholders).
import { useSyncExternalStore } from "react";

let tick = 0;
const subs = new Set();

export function refreshHome() {
  tick += 1;
  subs.forEach((f) => f());
}

const subscribe = (cb) => {
  subs.add(cb);
  return () => subs.delete(cb);
};

export function useRefreshTick() {
  return useSyncExternalStore(subscribe, () => tick, () => 0);
}

// The bottom bar's Home tab, tapped while already on Home.
export const HOME_TAP = "hooked-home-tap";
