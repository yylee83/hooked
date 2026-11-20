"use client";
// Home: a slim line back to your Up next queue (the full queue lives on My log → Up next). One tap plays the first one.
import Link from "next/link";
import { useState } from "react";
import { PauseIcon, PlayIcon, usePlayer } from "./Player";
import { sameEpisode, upNext, useStore } from "@/lib/store";

export default function UpNextHome() {
  const state = useStore();
  const player = usePlayer();
  const [busy, setBusy] = useState(false);
  const list = upNext(state).filter((i) => i.episodeRef || i.episodeId);
  if (!list.length) return null;

  const first = list[0];
  const isThis = !player?.queueMeta && sameEpisode(player?.current, { ref: first.episodeRef, id: first.episodeId });

  async function play() {
    if (isThis) return player.toggle();
    setBusy(true);
    await player?.playItem(first);
    setBusy(false);
  }

  return (
    <div className="upnext-line">
      <Link href="/me#upnext" className="upnext-line__link">
        <span className="mono small upnext-line__label">Up next · {list.length}</span>
        <span className="upnext-line__title">{first.title}</span>
      </Link>
      <button className="upnext-line__play" onClick={play} disabled={busy} aria-label={isThis && player.playing ? "Pause" : `Play ${first.title}`}>
        {isThis && player.playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
    </div>
  );
}
