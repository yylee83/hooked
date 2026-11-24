"use client";
// Every account needs a handle (YY, 2026-11-22): it's how people find and follow you. The sign-up form asks for one;
// anyone signed in without one (an email-link sign-up, or a handle someone else took first) is sent to My log, which
// asks for it at the top. Pages for signing in stay open.
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";

const OPEN = ["/me", "/login", "/auth", "/reset-password"];

export default function HandleGate() {
  const state = useStore();
  const path = usePathname() || "/";
  const router = useRouter();
  // Only a profile that really loaded (it has created_at): never on a failed load.
  const missing = !!state?.user && !!state.profile?.created_at && !state.profile.handle;
  const open = OPEN.some((p) => path === p || path.startsWith(`${p}/`));
  useEffect(() => {
    if (missing && !open) router.replace("/me");
  }, [missing, open, router]);
  return null;
}
