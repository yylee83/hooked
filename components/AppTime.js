"use client";
// Time in the app, for the team's stats page (YY, 2026-11-25). Signed-in people only. Once a minute, if Hooked is on
// screen and the person tapped, scrolled or typed in the last 2 minutes, it tells the database "I was here this
// minute" (record_app_minute). Nothing about which page, and the app never reads it back. See
// supabase/migrations/20261125220000_team_stats.sql.
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

const EVERY = 60_000;
const IDLE = 2 * 60_000;

export default function AppTime() {
  const state = useStore();
  const uid = state?.user?.id;

  useEffect(() => {
    if (!uid) return;
    let lastInput = Date.now();
    const seen = () => { lastInput = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart", "wheel"];
    events.forEach((e) => window.addEventListener(e, seen, { passive: true, capture: true }));
    const tick = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastInput > IDLE) return;
      supabase()?.rpc("record_app_minute").then(() => {}, () => {});
    };
    const first = setTimeout(tick, 5_000);
    const timer = setInterval(tick, EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, seen, { capture: true }));
    };
  }, [uid]);

  return null;
}
