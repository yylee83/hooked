"use client";
// How many notifications you haven't seen yet, shared by everything that shows it (the bell, the My log tab in the
// bottom bar, the "new notification" note), so they always agree and Hooked asks the database once, not once each.
// Asked on opening Hooked, on signing in, on changing pages, on coming back to the tab, and every minute.
import { useEffect, useSyncExternalStore } from "react";
import { unreadSummary } from "./social";

const EMPTY = { uid: null, count: 0, newest: null };
let snap = EMPTY;
const listeners = new Set();
let inflight = null;
let lastAsked = 0;
let users = 0;
let timer = null;

const emit = () => listeners.forEach((fn) => fn());
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Ask again (at most every few seconds, so several components mounting together share one question).
export function refreshUnread(uid, force = false) {
  if (!uid) {
    if (snap !== EMPTY) (snap = EMPTY), emit();
    return;
  }
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  if (!force && snap.uid === uid && (inflight || Date.now() - lastAsked < 5000)) return;
  lastAsked = Date.now();
  const ask = (inflight = unreadSummary(uid)
    .then(({ count, newest }) => {
      if (inflight !== ask) return;
      snap = { uid, count, newest };
      emit();
    })
    .catch(() => {})
    .finally(() => inflight === ask && (inflight = null)));
}

// Opening the notifications page marks them all read.
if (typeof window !== "undefined") {
  window.addEventListener("hooked-notes-read", () => {
    if (snap.count || snap.newest) (snap = { ...snap, count: 0, newest: null }), emit();
  });
}

// The unread count for this person. `key` (the page, Home's refresh) asks again when it changes.
export function useUnread(uid, key) {
  const s = useSyncExternalStore(subscribe, () => snap, () => EMPTY);
  useEffect(() => {
    refreshUnread(uid);
  }, [uid, key]);
  useEffect(() => {
    if (!uid) return;
    users++;
    const check = () => refreshUnread(uid);
    if (!timer) timer = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      if (--users === 0) clearInterval(timer), (timer = null);
    };
  }, [uid]);
  return s.uid === uid ? s : EMPTY;
}

export const badgeText = (n) => (n > 9 ? "9+" : String(n));
