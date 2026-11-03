"use client";
// Every show you're hooked on (My log → Hooked on → "+3 more").
import Link from "next/link";
import Art from "./Art";
import { hookedShows, useStore } from "@/lib/store";
import { showHref } from "@/lib/addresses";
import { plural } from "@/lib/format";

const TILTS = [-2, 1.5, -1, 2, -1.5, 1];

export default function HookedShows() {
  const state = useStore();
  if (!state) return <div className="loading" aria-label="Loading" />;
  const shows = hookedShows(state);

  return (
    <>
      <Link href="/me" className="back">
        ← My log
      </Link>
      <h1 className="display h-lg cobalt" style={{ marginTop: 10 }}>Hooked on</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        {shows.length ? plural(shows.length, "show") : "Shows you love show up here."}
      </p>

      {shows.length === 0 ? (
        <div className="empty card" style={{ marginTop: 16 }}>
          <p>Open a show and tap “Hooked on this?”, or log an episode you&rsquo;re hooked on.</p>
          <Link className="btn btn--cobalt btn--shadow-sm" href="/search">
            Find a show
          </Link>
        </div>
      ) : (
        <ul className="hooked-grid">
          {shows.map((s, i) => (
            <li key={s.showRef || s.feedId}>
              <Link href={showHref(s.showRef, s.feedId)} className="hooked-grid__item">
                <Art src={s.image} title={s.title || ""} size="100%" tilt={TILTS[i % TILTS.length]} radius={18} className="art--fluid" />
                <span className="hooked-grid__title">{s.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
