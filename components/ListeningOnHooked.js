"use client";
// Home, signed out: "Listening on Hooked now", what people played in the last day. Episodes only, no names
// (/api/listening-now). Signed in, "Friends listening now" (components/Friends.js) shows instead, and falls back to this
// (`always`) when no friends have played anything in the last day.
import Link from "next/link";
import { useEffect, useState } from "react";
import Art from "./Art";
import { useStore } from "@/lib/store";
import { episodeHref } from "@/lib/addresses";

export default function ListeningOnHooked({ always = false }) {
  const state = useStore();
  const [episodes, setEpisodes] = useState(null);
  const shown = !!state && (always || !state.user);

  useEffect(() => {
    if (!shown) return;
    let live = true;
    fetch("/api/listening-now")
      .then((r) => (r.ok ? r.json() : { episodes: [] }))
      .then((d) => live && setEpisodes(d.episodes || []))
      .catch(() => live && setEpisodes([]));
    return () => {
      live = false;
    };
  }, [shown]);

  if (!shown || !episodes?.length) return null;
  return (
    <>
      <h2 className="section-title">Listening on Hooked now</h2>
      <div className="np-row">
        {episodes.map((e, i) => (
          <Link key={e.ref || e.id} href={episodeHref(e.ref, e.id)} className="np">
            <Art src={e.image} title={e.feedTitle || ""} size={150} tilt={[-2, 1.5, -1][i % 3]} radius={22} />
            <p className="np__who">{e.listeners === 1 ? "1 listening" : `${e.listeners} listening`}</p>
            <p className="np__show">{e.feedTitle || e.title}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
