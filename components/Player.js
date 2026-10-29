"use client";
// The player above the bottom bar. Its progress bar is the Hooked playhead.
// It can play one episode, or a queue of clips back to back (a brief's "cut").
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Art from "./Art";
import { setNowPlaying } from "@/lib/store";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const audio = useRef(null);
  const src = useRef("");
  const q = useRef({ segs: [], i: 0, meta: null });
  const [, force] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const path = usePathname() || "";

  const seg = () => q.current.segs[q.current.i];
  const segLen = (s) => Math.max(0, (s.end ?? s.ep.duration ?? 0) - s.start);
  const total = () => q.current.segs.reduce((sum, s) => sum + segLen(s), 0);

  const startSeg = useCallback((i, offset = 0) => {
    const el = audio.current;
    const s = q.current.segs[i];
    if (!el || !s) return;
    q.current.i = i;
    force((n) => n + 1);
    const at = s.start + offset;
    if (src.current !== s.ep.audio) {
      src.current = s.ep.audio;
      el.src = s.ep.audio;
      const seekWhenReady = () => {
        if (at > 0) el.currentTime = at;
        el.play().catch(() => {});
      };
      el.addEventListener("loadedmetadata", seekWhenReady, { once: true });
      el.load();
    } else {
      el.currentTime = at;
      el.play().catch(() => {});
    }
    setNowPlaying({ ...s.ep });
  }, []);

  // Play a list of segments: [{ ep, start, end }], with optional { title } for a brief.
  const playQueue = useCallback(
    (segs, meta = null) => {
      if (!segs.length) return;
      q.current = { segs, i: 0, meta };
      setProgress(0);
      startSeg(0);
    },
    [startSeg]
  );

  // Play/pause one episode.
  const play = useCallback(
    (ep) => {
      const el = audio.current;
      if (!el || !ep?.audio) return;
      const cur = seg();
      if (!q.current.meta && cur?.ep.id === ep.id) {
        el.paused ? el.play() : el.pause();
        return;
      }
      playQueue([{ ep, start: 0, end: null }]);
    },
    [playQueue]
  );

  const toggle = () => {
    const el = audio.current;
    if (el) el.paused ? el.play().catch(() => {}) : el.pause();
  };

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const next = () => {
      const { i, segs } = q.current;
      if (i + 1 < segs.length) startSeg(i + 1);
      else el.pause();
    };
    const onTime = () => {
      const s = seg();
      if (!s) return;
      const end = s.end ?? el.duration;
      if (s.end && el.currentTime >= s.end) return next();
      if (q.current.meta) {
        const before = q.current.segs.slice(0, q.current.i).reduce((sum, x) => sum + segLen(x), 0);
        const t = total();
        setProgress(t ? Math.min(1, (before + el.currentTime - s.start) / t) : 0);
      } else {
        setProgress(end ? el.currentTime / end : 0);
      }
    };
    const on = () => setPlaying(true);
    const off = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", on);
    el.addEventListener("pause", off);
    el.addEventListener("ended", next);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", on);
      el.removeEventListener("pause", off);
      el.removeEventListener("ended", next);
    };
  }, [startSeg]);

  function seek(e) {
    const el = audio.current;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    if (q.current.meta) {
      let target = f * total();
      for (let i = 0; i < q.current.segs.length; i++) {
        const len = segLen(q.current.segs[i]);
        if (target <= len || i === q.current.segs.length - 1) return startSeg(i, Math.min(target, len));
        target -= len;
      }
    } else if (el?.duration) {
      el.currentTime = f * el.duration;
    }
  }

  const s = seg();
  const meta = q.current.meta;
  const hidden = !s || path.startsWith("/log/");

  return (
    <PlayerContext.Provider value={{ play, playQueue, toggle, current: s?.ep || null, playing, queueMeta: meta }}>
      {children}
      <audio ref={audio} preload="none" />
      {!hidden && (
        <div className="mini">
          <div className="mini__inner">
            <Art src={s.ep.image} title={s.ep.feedTitle} size={46} radius={10} />
            <div className="mini__text">
              {meta && (
                <p className="mini__meta mono">
                  {meta.title} · clip {q.current.i + 1} of {q.current.segs.length}
                </p>
              )}
              <Link href={`/log/${s.ep.id}`} className="mini__title">
                {s.ep.title}
              </Link>
              <div className="playhead playhead--live" onClick={seek} role="slider" aria-label="Seek" aria-valuenow={Math.round(progress * 100)}>
                <span className="playhead__fill" style={{ width: `${progress * 100}%` }} />
                <span className="playhead__knob" style={{ left: `${progress * 100}%` }} />
              </div>
            </div>
            {meta && q.current.i + 1 < q.current.segs.length && (
              <button className="mini__skip" onClick={() => startSeg(q.current.i + 1)} aria-label="Next clip">
                <NextIcon />
              </button>
            )}
            <button className="mini__btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
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

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M5 5v14l10-7z" fill="currentColor" />
      <rect x="16" y="5" width="3" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

// "Play" button used on episode rows.
export function PlayButton({ episode }) {
  const p = usePlayer();
  if (!episode.audio) return null;
  const isThis = !p?.queueMeta && p?.current?.id === episode.id;
  return (
    <button className="btn btn--sm" onClick={() => p.play(episode)}>
      {isThis && p.playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
      {isThis && p.playing ? "Pause" : "Play"}
    </button>
  );
}

// Big button that plays a brief's clips back to back as one listen.
export function PlayCut({ segs, title, label, tone }) {
  const p = usePlayer();
  if (!segs.length) return null;
  const isThis = p?.queueMeta?.title === title;
  return (
    <button
      className={`btn btn--big btn--display ${tone === "cobalt" ? "btn--butter" : "btn--cobalt"} play-cut`}
      onClick={() => (isThis ? p.toggle() : p.playQueue(segs, { title }))}
    >
      {isThis && p.playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
      {isThis && p.playing ? "Pause" : label}
    </button>
  );
}

// A clip time chip ("12:04–14:30") that plays just that clip.
export function ClipChip({ seg, label, title }) {
  const p = usePlayer();
  if (!seg.ep.audio) return <span className="clip-chip">{label}</span>;
  return (
    <button className="clip-chip" onClick={() => p.playQueue([seg], { title })}>
      <PlayIcon size={11} /> {label}
    </button>
  );
}
