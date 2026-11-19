"use client";
// My log → Up next: "Keep listening", episodes you started and didn't finish, newest first (Erin, 2026-11-18). Since
// an episode comes off Up next when it starts playing, this is where one you stopped partway through lives.
// Built from your saved spots (lib/progress.js: this device's, merged with your account's by lib/progress-sync.js when
// the player opens), so it needs nothing new saved. Details come from /api/episode (cached). The episode in the player
// is left out: it's already in the bar, and so is an episode you've logged with a minute or less left (shown as "1 min
// left": under 90 seconds; Erin, 2026-11-18). Remove forgets the spot (next time it starts from the top).
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Art from "./Art";
import { PlayButton, usePlayer } from "./Player";
import { allSpots, clearProgress } from "@/lib/progress";
import { findLog, sameEpisode, useStore } from "@/lib/store";
import { episodeHref } from "@/lib/addresses";
import { minutes } from "@/lib/format";

const MAX = 10;
const OUR_ID = /^[a-z2-9]{8}$/;
const LOGGED_NEAR_END = 90; // seconds left: anything that reads "1 min left" or less

export default function KeepListening() {
  const player = usePlayer();
  const state = useStore();
  const [rows, setRows] = useState(null); // [{ ep, t, d, at }]

  const load = useCallback(async () => {
    const spots = Object.entries(allSpots())
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(0, MAX + 1); // one spare, for the episode in the player
    const found = await Promise.all(
      spots.map(async ([key, s]) => {
        try {
          const res = await fetch(`/api/episode?${OUR_ID.test(key) ? "ref" : "id"}=${encodeURIComponent(key)}`);
          if (!res.ok) return null;
          const ep = await res.json();
          return ep?.audio ? { ep, t: s.t, d: s.d || ep.duration || 0, at: s.at } : null;
        } catch {
          return null;
        }
      })
    );
    setRows(found.filter(Boolean));
  }, []);

  // On opening the tab, and on coming back to it (another device may have moved your spots meanwhile).
  useEffect(() => {
    load();
    const again = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, [load]);

  const inPlayer = (r) => player?.current && !player.queueMeta && sameEpisode(player.current, r.ep);
  const loggedNearEnd = (r) => r.d > 0 && r.d - r.t < LOGGED_NEAR_END && state && findLog(state, r.ep);
  const shown = (rows || []).filter((r) => !inPlayer(r) && !loggedNearEnd(r)).slice(0, MAX);
  if (!shown.length) return null;

  function remove(r) {
    clearProgress(r.ep);
    setRows((list) => list.filter((x) => x !== r));
  }

  return (
    <section className="keep-listening">
      <h2 className="section-title">Keep listening</h2>
      <ul className="keep-listening__list">
        {shown.map((r) => {
          const left = r.d > r.t ? r.d - r.t : 0;
          return (
            <li key={r.ep.ref || r.ep.id} className="list__row">
              <Art src={r.ep.image} title={r.ep.feedTitle} size={48} radius={10} episodeRef={r.ep.ref} episodeId={r.ep.id} />
              <div className="min0 grow">
                <Link href={episodeHref(r.ep.ref, r.ep.id)} className="title-sm">
                  {r.ep.title}
                </Link>
                <p className="muted small">{r.ep.feedTitle}</p>
                {r.d > 0 && (
                  <div className="keep-listening__meter" aria-label={`${Math.round((r.t / r.d) * 100)}% listened`}>
                    <span style={{ width: `${Math.min(100, (r.t / r.d) * 100)}%` }} />
                  </div>
                )}
                {left > 0 && <p className="mono small keep-listening__left">{minutes(left)} left</p>}
              </div>
              <div className="upnext__actions">
                <PlayButton episode={r.ep} />
                <button className="link-btn small" onClick={() => remove(r)} aria-label={`Remove ${r.ep.title} from Keep listening`}>
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
