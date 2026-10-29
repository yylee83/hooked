"use client";
// A small player that sits above the bottom bar. Its progress bar is the Hooked playhead.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Art from "./Art";
import { setNowPlaying } from "@/lib/store";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const audio = useRef(null);
  const [ep, setEp] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const path = usePathname() || "";

  function play(episode) {
    const el = audio.current;
    if (!el || !episode?.audio) return;
    if (ep?.id === episode.id) {
      el.paused ? el.play() : el.pause();
      return;
    }
    setEp(episode);
    setProgress(0);
    el.src = episode.audio;
    el.play().catch(() => {});
    setNowPlaying({ ...episode });
  }

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", on);
    el.addEventListener("pause", off);
    el.addEventListener("ended", off);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", on);
      el.removeEventListener("pause", off);
      el.removeEventListener("ended", off);
    };
  }, []);

  function seek(e) {
    const el = audio.current;
    if (!el?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * el.duration;
  }

  const hidden = !ep || path.startsWith("/log/");

  return (
    <PlayerContext.Provider value={{ play, current: ep, playing }}>
      {children}
      <audio ref={audio} preload="none" />
      {!hidden && (
        <div className="mini">
          <div className="mini__inner">
            <Art src={ep.image} title={ep.feedTitle} size={46} radius={10} />
            <div className="mini__text">
              <Link href={`/log/${ep.id}`} className="mini__title">
                {ep.title}
              </Link>
              <div className="playhead playhead--live" onClick={seek} role="slider" aria-label="Seek" aria-valuenow={Math.round(progress * 100)}>
                <span className="playhead__fill" style={{ width: `${progress * 100}%` }} />
                <span className="playhead__knob" style={{ left: `${progress * 100}%` }} />
              </div>
            </div>
            <button className="mini__btn" onClick={() => play(ep)} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}

export function PlayIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function PauseIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <rect x="5.5" y="4.5" width="4.5" height="15" rx="1.5" fill="currentColor" />
      <rect x="14" y="4.5" width="4.5" height="15" rx="1.5" fill="currentColor" />
    </svg>
  );
}

// "Play" button used on episode rows.
export function PlayButton({ episode }) {
  const p = usePlayer();
  if (!episode.audio) return null;
  const isThis = p?.current?.id === episode.id;
  return (
    <button className="btn btn--sm" onClick={() => p.play(episode)}>
      {isThis && p.playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      {isThis && p.playing ? "Pause" : "Play"}
    </button>
  );
}
