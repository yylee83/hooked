"use client";
// Home: "New episodes from your hooked shows", a swipe row of the newest episodes, ready to play.
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
      <h2 className="section-title">{hooked ? "New episodes from your hooked shows" : "New from popular shows on Hooked"}</h2>
      {!hooked && state.user && <p className="muted small new-eps__hint">Hook the shows you love and their new episodes land here.</p>}
      {!data ? (
        <div className="foryou" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="foryou__card foryou__card--ghost" />
          ))}
        </div>
      ) : !episodes.length ? (
        <p className="muted">Nothing new from your hooked shows yet. You’ve caught up.</p>
      ) : (
        <div className="foryou">
          {episodes.map((ep) => (
            <article key={ep.ref || ep.id} className="foryou__card">
              {ep.date > 0 && <span className="foryou__why new-eps__when mono">{released(ep.date)}</span>}
              <Art src={ep.image} title={ep.feedTitle} size="100%" radius={14} className="art--fluid" episodeRef={ep.ref} episodeId={ep.id} />
              <Link href={episodeHref(ep.ref, ep.id)} className="foryou__title">
                {ep.title}
              </Link>
              <p className="muted small foryou__show">{ep.feedTitle}</p>
              <div className="row gap-xs foryou__actions">
                <PlayButton episode={ep} />
                <QueueButton episode={ep} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
