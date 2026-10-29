"use client";
// Home: your Up next queue, right at the top, one tap from playing.
import Link from "next/link";
import { useState } from "react";
import Art from "./Art";
import { PauseIcon, PlayIcon, usePlayer } from "./Player";
import { upNext, useStore } from "@/lib/store";

export default function UpNextHome() {
  const state = useStore();
  const player = usePlayer();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const list = upNext(state).filter((i) => i.episodeId);
  if (!list.length) return null;

  const first = list[0];
  const rest = list.slice(1, 4);
  const isThis = !player?.queueMeta && String(player?.current?.id) === String(first.episodeId);

  async function play() {
    if (isThis) return player.toggle();
    setBusy(true);
    setFailed(false);
    const ok = await player?.playItem(first);
    if (!ok) setFailed(true);
    setBusy(false);
  }

  return (
    <section className="upnext-home" aria-label="Up next">
      <div className="upnext-home__head">
        <span className="mono small">Up next{list.length > 1 ? ` · ${list.length}` : ""}</span>
        <Link href="/me#upnext" className="upnext-home__all">
          See all →
        </Link>
      </div>
      <div className="upnext-home__main">
        <Art src={first.image} title={first.feedTitle} size={72} radius={14} episodeId={first.episodeId} />
        <div className="min0 grow">
          <Link href={`/episode/${first.episodeId}`} className="upnext-home__title">
            {first.title}
          </Link>
          <p className="upnext-home__show">{first.feedTitle}</p>
          {failed && <p className="small" style={{ marginTop: 4 }}>Couldn't play this one. Try another.</p>}
        </div>
        <button className="upnext-home__play" onClick={play} disabled={busy} aria-label={isThis && player.playing ? "Pause" : `Play ${first.title}`}>
          {isThis && player.playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
        </button>
      </div>
      {rest.length > 0 && (
        <div className="upnext-home__rest">
          <span className="small">Then:</span>
          {rest.map((i) => (
            <Art key={i.episodeId} src={i.image} title={i.feedTitle} size={34} radius={8} episodeId={i.episodeId} />
          ))}
          {list.length > 4 && <span className="mono small">+{list.length - 4}</span>}
        </div>
      )}
    </section>
  );
}
