"use client";
// My log: your Up next queue in a big card above the tabs, one tap from playing. "See all" opens the Up next tab.
import Link from "next/link";
import { useState } from "react";
import Art from "./Art";
import { PauseIcon, PlayIcon, usePlayer } from "./Player";
import { sameEpisode, upNext, useStore } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import { episodeHref } from "@/lib/addresses";

export default function UpNextCard({ onSeeAll }) {
  const state = useStore();
  const player = usePlayer();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const list = upNext(state).filter((i) => i.episodeRef || i.episodeId);
  if (!list.length) return null;

  const first = list[0];
  const rest = list.slice(1, 4);
  const isThis = !player?.queueMeta && sameEpisode(player?.current, { ref: first.episodeRef, id: first.episodeId });

  async function play() {
    haptic();
    if (isThis) return player.toggle();
    setBusy(true);
    setFailed(false);
    const ok = await player?.playItem(first);
    if (!ok) setFailed(true);
    setBusy(false);
  }

  return (
    <section className="upnext-card" aria-label="Up next">
      <div className="upnext-card__head">
        <span className="mono small">Up next{list.length > 1 ? ` · ${list.length}` : ""}</span>
        <button type="button" onClick={onSeeAll} className="upnext-card__all">
          See all →
        </button>
      </div>
      <div className="upnext-card__main">
        <Art src={first.image} title={first.feedTitle} size={72} radius={14} episodeRef={first.episodeRef} episodeId={first.episodeId} />
        <div className="min0 grow">
          <Link href={episodeHref(first.episodeRef, first.episodeId)} className="upnext-card__title">
            {first.title}
          </Link>
          <p className="upnext-card__show">{first.feedTitle}</p>
          {failed && <p className="small" style={{ marginTop: 4 }}>Couldn't play this one. Try another.</p>}
        </div>
        <button className="upnext-card__play" onClick={play} disabled={busy} aria-label={isThis && player.playing ? "Pause" : `Play ${first.title}`}>
          {isThis && player.playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
        </button>
      </div>
      {rest.length > 0 && (
        <div className="upnext-card__rest">
          <span className="small">Then:</span>
          {rest.map((i) => (
            <Art key={i.episodeRef || i.episodeId} src={i.image} title={i.feedTitle} size={34} radius={8} episodeRef={i.episodeRef} episodeId={i.episodeId} />
          ))}
          {list.length > 4 && <span className="mono small">+{list.length - 4}</span>}
        </div>
      )}
    </section>
  );
}
