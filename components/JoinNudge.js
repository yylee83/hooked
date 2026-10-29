"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { site } from "@/lib/site";

// Shown on shared links to people who aren't signed in.
export function JoinNudge({ from }) {
  const state = useStore();
  if (!state || !state.accounts || state.user) return null;
  return (
    <section className="card join-nudge">
      <p className="display h-md" style={{ margin: 0 }}>Keep a log like @{from}.</p>
      <p style={{ margin: "8px 0 16px" }}>
        {site.name} is where you track the podcasts you love, rate them, and see what your friends are hooked on. Free.
      </p>
      <div className="row gap wrap">
        <Link href={`/login?mode=signup&next=/u/${from}`} className="btn btn--cobalt btn--shadow-sm">
          Join {site.name}
        </Link>
        <Link href={`/u/${from}`} className="btn">
          See @{from}'s log
        </Link>
      </div>
    </section>
  );
}
