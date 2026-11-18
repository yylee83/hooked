"use client";
// Home: "New episodes" (from your hooked shows), a swipe row of small cards with play and + Up next icons.
// Signed out (or nothing hooked yet): "New from popular shows on Hooked" instead. Data: /api/new-episodes.
import Link from "next/link";
import { useEffect, useState } from "react";
import Art from "./Art";
import { PlayButton } from "./Player";
import { QueueButton } from "./Social";
import { hookedShows, useStore } from "@/lib/store";
import { episodeHref } from "@/lib/addresses";
import { shortDate } from "@/lib/format";

// "Today", "Yesterday", "3 days ago", then the date.
function released(unixSeconds) {
  if (!unixSeconds) return "";
  const days = Math.floor((Date.now() / 1000 - unixSeconds) / 86400);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(unixSeconds);
}

export default function NewEpisodes() {
  const state = useStore();
  const [data, setData] = useState(null); // { mode, episodes }
  const shows = state ? hookedShows(state).map((s) => String(s.showRef || s.feedId || "")).filter(Boolean).slice(0, 12) : [];
  const logged = state ? state.logs.map((l) => String(l.ref || l.id || "")).filter(Boolean) : [];
  const key = state ? JSON.stringify({ shows, logged }) : "";

  useEffect(() => {
    if (!key) return;
    let live = true;
    fetch("/api/new-episodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: key })
      .then((r) => (r.ok ? r.json() : { episodes: [] }))
      .then((d) => live && setData(d))
      .catch(() => live && setData({ episodes: [] }));
    return () => {
      live = false;
    };
  }, [key]);

  if (!state) return null;
  const hooked = shows.length > 0;
  const episodes = data?.episodes || [];
  if (data && !episodes.length && !hooked) return null;

  return (
    <section className="new-eps">
      <h2 className="section-title">{hooked ? "New episodes" : "New from popular shows on Hooked"}</h2>
      {!hooked && state.user && <p className="muted small new-eps__hint">Hook the shows you love and their new episodes land here.</p>}
      {!data ? (
        <div className="new-eps__row" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="new-eps__card new-eps__card--ghost" />
          ))}
        </div>
      ) : !episodes.length ? (
        <p className="muted">Nothing new from your hooked shows yet. You’ve caught up.</p>
      ) : (
        <div className="new-eps__row">
          {episodes.map((ep) => (
            <article key={ep.ref || ep.id} className="new-eps__card">
              <Art src={ep.image} title={ep.feedTitle} size="100%" radius={12} className="art--fluid" episodeRef={ep.ref} episodeId={ep.id} />
              <Link href={episodeHref(ep.ref, ep.id)} className="new-eps__title">
                {ep.title}
              </Link>
              <p className="new-eps__show">{ep.feedTitle}</p>
              <div className="new-eps__foot">
                {ep.date > 0 && <span className="new-eps__when mono">{released(ep.date)}</span>}
                <span className="new-eps__acts">
                  <PlayButton episode={ep} icon />
                  <QueueButton episode={ep} icon />
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
