"use client";
// Home: episodes you finished in Hooked's player but didn't log: ones that ended with the screen off, or whose
// "Log it?" you closed. Each waits 3 days; Skip means it's never asked about again (lib/finished.js).
import Link from "next/link";
import Art from "./Art";
import { findLog, useStore } from "@/lib/store";
import { logHref } from "@/lib/addresses";
import { skipFinished, useFinished } from "@/lib/finished";

function when(at) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86400_000);
  if (days <= 0) return "finished today";
  if (days === 1) return "finished yesterday";
  return `finished ${new Date(at).toLocaleDateString("en-US", { weekday: "long" })}`;
}

export default function FinishedNotLogged() {
  const state = useStore();
  const waiting = useFinished().filter((f) => f.stage === "later" && !findLog(state, f.ep));
  if (!waiting.length) return null;
  return (
    <section className="finished-home" aria-label="Finished, not logged">
      <h2 className="mono small finished-home__head">Finished, not logged</h2>
      <ul>
        {waiting.map(({ ep, at }) => (
          <li key={ep.ref || ep.id} className="finished-home__row">
            <Art src={ep.image} title={ep.feedTitle} size={52} radius={12} episodeRef={ep.ref} episodeId={ep.id} />
            <div className="min0 grow">
              <p className="title-sm finished-home__title">{ep.title}</p>
              <p className="muted small">
                {ep.feedTitle} · {when(at)}
              </p>
              <div className="finished-home__btns">
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
