"use client";
// My log (Episodes tab): episodes you finished in Hooked's player but didn't log: ones that ended with the screen
// off, or whose "Log it?" you closed. Each waits 3 days; Skip means it's never asked about again (lib/finished.js).
// Signed in, it's the same list on every device (lib/finished-sync.js).
import { useEffect } from "react";
import Link from "next/link";
import Art from "./Art";
import { findLog, useStore } from "@/lib/store";
import { logHref } from "@/lib/addresses";
import { doneFinished, skipFinished, useFinished } from "@/lib/finished";

function when(at) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400_000);
  if (days <= 0) return "finished today";
  if (days === 1) return "finished yesterday";
  return `finished ${new Date(at).toLocaleDateString("en-US", { weekday: "long" })}`;
}

export default function FinishedNotLogged() {
  const state = useStore();
  const all = useFinished();
  const waiting = all.filter((f) => f.stage === "later" && !findLog(state, f.ep));
  // Logged since (from the log sheet, or on another device): clear it, here and in your account.
  const logged = all.filter((f) => findLog(state, f.ep));
  useEffect(() => {
    logged.forEach((f) => doneFinished(f.ep));
  }, [logged.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!waiting.length) return null;
  return (
    <section className="finished-list" aria-label="Finished, not logged">
      <h2 className="mono small finished-list__head">Finished, not logged</h2>
      <ul>
        {waiting.map(({ ep, at }) => (
          <li key={ep.ref || ep.id} className="finished-list__row">
            <Art src={ep.image} title={ep.feedTitle} size={52} radius={12} episodeRef={ep.ref} episodeId={ep.id} />
            <div className="min0 grow">
              <p className="title-sm finished-list__title">{ep.title}</p>
              <p className="muted small">
                {ep.feedTitle} · {when(at)}
              </p>
              <div className="finished-list__btns">
                <Link href={logHref(ep.ref, ep.id)} className="btn btn--sm btn--butter">
                  Log it
                </Link>
                <button className="btn btn--sm" onClick={() => skipFinished(ep)}>
                  Skip
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
