"use client";
// Your shows (My log → Hooked on → "+3 more" / "All your shows"). Since the Shows tab left My log (YY, 2026-11-25),
// this is where every show lives: the ones you're hooked on at the top, then "Also listened to": shows you've logged
// an episode of or played in Hooked's player (my_listening) but aren't hooked on, each with a small Hook show pill.
import Link from "next/link";
import { useMemo } from "react";
import BackButton from "./BackButton";
import Art from "./Art";
import Stars from "./Stars";
import { HookShowPill } from "./Social";
import { showsFromLogs } from "./LogViews";
import { findHookedShow, hookedShows, sameShow, useStore } from "@/lib/store";
import { listenedHours, useMyListening } from "@/lib/my-listening";
import { showHref } from "@/lib/addresses";
import { plural } from "@/lib/format";

const TILTS = [-2, 1.5, -1, 2, -1.5, 1];

export default function HookedShows() {
  const state = useStore();
  const listening = useMyListening(state?.user?.id || null);

  // Shows from your logs, plus shows you played here, minus the ones you're hooked on. Most-listened first.
  const also = useMemo(() => {
    if (!state) return [];
    const list = showsFromLogs(state.logs, {}).map((s) => ({ ...s, seconds: 0 }));
    for (const p of listening?.shows || []) {
      const show = { showRef: p.id, feedId: p.podcastindex_id ?? undefined, title: p.title, image: p.image };
      const had = list.find((s) => sameShow(s, show));
      if (had) {
        had.seconds = p.seconds || 0;
        had.showRef ||= p.id;
        had.image ||= p.image;
      } else list.push({ ...show, logs: [], avg: 0, last: 0, seconds: p.seconds || 0 });
    }
    return list
      .filter((s) => !findHookedShow(state, s))
      .sort((a, b) => b.seconds - a.seconds || b.logs.length - a.logs.length || b.last - a.last);
  }, [state, listening]);

  if (!state) return <div className="loading" aria-label="Loading" />;
  const shows = hookedShows(state);

  return (
    <>
      <BackButton fallback="/me" />
      <h1 className="display h-lg cobalt" style={{ marginTop: 10 }}>Your shows</h1>

      <h2 className="label your-shows__label">Hooked on</h2>
      {shows.length === 0 ? (
        <p className="muted">Tap “Hook show” on a show you love and it shows up here.</p>
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

      {also.length > 0 && (
        <>
          <h2 className="label your-shows__label">Also listened to</h2>
          <ul className="your-shows__list">
            {also.map((s) => {
              const hrs = s.seconds >= 360 ? listenedHours(s.seconds) : 0;
              const meta = [s.logs.length ? `${plural(s.logs.length, "episode")} logged` : "", hrs ? `${hrs} hr listened` : ""].filter(Boolean).join(" · ");
              return (
                <li key={s.showRef || s.feedId || s.title} className="list__row">
                  <Link href={showHref(s.showRef, s.feedId)} className="your-shows__show min0 grow">
                    <Art src={s.image} title={s.title || ""} size={48} radius={10} />
                    <span className="min0">
                      <span className="title-sm your-shows__title">{s.title}</span>
                      <span className="your-shows__meta muted small">
                        {s.avg > 0 && <Stars value={Math.round(s.avg * 2) / 2} size={12} />}
                        {meta}
                      </span>
                    </span>
                  </Link>
                  <HookShowPill episode={{ showRef: s.showRef, feedId: s.feedId, feedTitle: s.title, feedImage: s.image }} short />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {shows.length === 0 && also.length === 0 && (
        <div className="empty card" style={{ marginTop: 16 }}>
          <p>Shows you listen to and love show up here.</p>
          <Link className="btn btn--cobalt btn--shadow-sm" href="/search">
            Find a show
          </Link>
        </div>
      )}
    </>
  );
}
