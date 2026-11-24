"use client";
// After you follow someone, reply, send an episode or react, tell the server so the other person's email goes out
// now (lib/notify-email.js decides whether one is due). Waits a moment so a quick burst becomes one ping.
import { supabase } from "./supabase/client";

let timer;

export function pingNotifyEmails() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const { data } = await supabase().auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      await fetch("/api/notify-email", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true });
    } catch {}
  }, 2000);
}
