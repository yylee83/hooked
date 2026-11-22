"use client";
// Logging, Up next and hooking a show need an account (Erin, 2026-11-21: sign-up is invite-only, so saving on a
// device you can't move into an account made no sense). Signed out, those buttons open sign-in and bring you back
// afterwards. Signed-out visitors can still browse and listen. lib/store.js refuses these saves too, as a backstop.
import { usePathname, useRouter } from "next/navigation";
import { needsAccount, useStore } from "./store";

export const signInHref = (next) => `/login?next=${encodeURIComponent(next || "/")}`;

export function useSignInFirst() {
  const state = useStore();
  const router = useRouter();
  const path = usePathname() || "/";
  const needed = needsAccount(state);
  const go = (next) => router.push(signInHref(next || path + (typeof window !== "undefined" ? window.location.search : "")));
  // `guard(fn)`: an onClick that runs fn when signed in, and opens sign-in when not.
  const guard = (fn) => (...args) => (needsAccount(state) ? go() : fn(...args));
  return { needed, go, guard, href: signInHref(path) };
}
