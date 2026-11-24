"use client";
// Step 1 of 3 after sign-up: pick a few favorite shows. Each pick is a hooked show (same as "+ Hook this show"),
// so it feeds Suggested follows, New episodes and Home right away. Search, or tap from what's popular.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { findHookedShow, toggleHookedShow, useStore } from "@/lib/store";
import { useSignInFirst } from "@/lib/sign-in-first";

export default function FavoriteShows({ popular }) {
  const state = useStore();
  const { guard } = useSignInFirst(); // signed out (someone opened this page directly): a tap opens sign-in
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null); // null: not searching
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setFound(null);
    let live = true;
    setBusy(true);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/shows?q=${encodeURIComponent(term)}`).then((r) => r.json()).catch(() => ({ shows: [] }));
      if (live) (setFound(res.shows || []), setBusy(false));
    }, 300);
    return () => ((live = false), clearTimeout(t));
  }, [q]);

  const picked = Object.values(state?.shows || {});
  const shows = found ?? popular;

  return (
    <div className="fav-shows">
      <p className="mono small cobalt">Step 1 of 3</p>
      <h1 className="display h-lg">Pick your favorite shows</h1>
      <p className="muted" style={{ margin: "8px 0 16px", fontSize: 18 }}>Three to five is plenty. We'll find you new episodes and people who listen to them.</p>

      <input
        className="input fav-shows__search"
        type="search"
        enterKeyHint="search"
        placeholder="Search shows"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search shows"
      />

      {picked.length > 0 && (
        <div className="fav-shows__picked" aria-label="Your picks">
          {picked.map((s) => (
            <button key={s.showRef || s.feedId} className="fav-shows__pick" onClick={guard(() => toggleHookedShow(s))} aria-label={`Remove ${s.title}`}>
              <Art src={s.image} title={s.title} size={44} radius={10} />
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      {(found || busy || shows.length > 0) && <p className="mono small muted fav-shows__label">{found ? (busy ? "Searching…" : found.length ? "Results" : "No shows found. Try another name.") : busy ? "Searching…" : "Popular right now"}</p>}
      <div className="taste__shows">
        {shows.map((s) => {
          const on = !!findHookedShow(state, s);
          return (
            <button key={s.showRef || s.feedId} className={`taste__show ${on ? "is-on" : ""}`} onClick={guard(() => toggleHookedShow(s))} aria-pressed={on}>
              <Art src={s.image} title={s.title} size="100%" radius={16} className="art--fluid" />
              {on && <span className="taste__check" aria-hidden="true">✓</span>}
              <span className="taste__title">{s.title}</span>
            </button>
          );
        })}
      </div>

      <div className="follow-few__bar">
        <Link href="/welcome/people" className="btn btn--display btn--cobalt btn--shadow-sm">
          {picked.length ? `Next · ${picked.length} picked` : "Skip for now"}
        </Link>
      </div>
    </div>
  );
}
