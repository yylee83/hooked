"use client";
// The player above the bottom bar. Its progress bar is the Hooked playhead.
// It can play one episode, or a queue of clips back to back (a brief's "cut").
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Art from "./Art";
import { getState, removeFromList, setNowPlaying, upNext } from "@/lib/store";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const audio = useRef(null);
  const src = useRef("");
  const q = useRef({ segs: [], i: 0, meta: null });
  const [, force] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [times, setTimes] = useState({ elapsed: 0, length: 0 });
  const [rate, setRate] = useState(1);
  const rateRef = useRef(1);
  const [drag, setDrag] = useState(null); // fraction while dragging the knob
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
      el.defaultPlaybackRate = rateRef.current;
      const seekWhenReady = () => {
        if (at > 0) el.currentTime = at;
        el.playbackRate = rateRef.current;
        el.play().catch(() => {});
      };
      el.addEventListener("loadedmetadata", seekWhenReady, { once: true });
      el.load();
    } else {
      el.currentTime = at;
      el.playbackRate = rateRef.current;
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

  // Play something saved to Up next (those don't store the audio link, so look it up first).
  const playItem = useCallback(
    async (item) => {
      if (!item?.episodeId) return false;
      try {
        const res = await fetch(`/api/episode?id=${item.episodeId}`);
        if (!res.ok) return false;
        const ep = await res.json();
        if (!ep.audio) return false;
        playQueue([{ ep, start: 0, end: null }]);
        return true;
      } catch {
        return false;
      }
    },
    [playQueue]
  );

  // When an episode from Up next finishes: take it off the list and start the next one.
  const advanceUpNext = useCallback(
    async (finished) => {
      const list = upNext(getState());
      const done = list.find((i) => String(i.episodeId) === String(finished?.id));
      if (!done) return;
      removeFromList(done);
      for (const item of list.filter((i) => i !== done)) {
        if (await playItem(item)) return;
      }
    },
    [playItem]
  );

  // Close the player: stop, unload, hide.
  const close = useCallback(() => {
    const el = audio.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    src.current = "";
    q.current = { segs: [], i: 0, meta: null };
    setProgress(0);
    setTimes({ elapsed: 0, length: 0 });
    setPlaying(false);
    try {
      navigator.mediaSession.metadata = null;
    } catch {}
    force((n) => n + 1);
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (el) el.paused ? el.play().catch(() => {}) : el.pause();
  };

  // Remember your playback speed between visits.
  useEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem("hooked:rate"));
      if (RATES.includes(saved)) {
        rateRef.current = saved;
        setRate(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const next = () => {
      const { i, segs } = q.current;
      if (i + 1 < segs.length) startSeg(i + 1);
      else {
        el.pause();
        if (!q.current.meta) advanceUpNext(segs[i]?.ep);
      }
    };
    const onTime = () => {
      const s = seg();
      if (!s) return;
      const end = s.end ?? el.duration;
      if (s.end && el.currentTime >= s.end) return next();
      if (q.current.meta) {
        const before = q.current.segs.slice(0, q.current.i).reduce((sum, x) => sum + segLen(x), 0);
        const t = total();
        const elapsed = Math.max(0, before + el.currentTime - s.start);
        setProgress(t ? Math.min(1, elapsed / t) : 0);
        setTimes({ elapsed, length: t });
      } else {
        setProgress(end ? el.currentTime / end : 0);
        setTimes({ elapsed: el.currentTime, length: end || 0 });
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
  }, [startSeg, advanceUpNext]);

  // Jump to a point, as a fraction of the episode (or of the whole cut).
  function seekTo(f) {
    const el = audio.current;
    f = Math.max(0, Math.min(1, f));
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

  // Back 15 / forward 30 seconds.
  function skip(seconds) {
    const el = audio.current;
    if (!el) return;
    if (q.current.meta) {
      const t = total();
      if (t) seekTo((times.elapsed + seconds) / t);
    } else if (el.duration) {
      el.currentTime = Math.max(0, Math.min(el.duration - 0.5, el.currentTime + seconds));
    }
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    rateRef.current = next;
    setRate(next);
    try {
      localStorage.setItem("hooked:rate", String(next));
    } catch {}
    const el = audio.current;
    if (el) {
      el.defaultPlaybackRate = next;
      el.playbackRate = next;
    }
  }

  // Drag the playhead knob (mouse or finger), or tap anywhere on the bar.
  const fracAt = (e, bar) => {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag(fracAt(e, e.currentTarget));
  };
  const onMove = (e) => {
    if (drag !== null) setDrag(fracAt(e, e.currentTarget));
  };
  const onUp = (e) => {
    if (drag === null) return;
    const f = fracAt(e, e.currentTarget);
    setDrag(null);
    seekTo(f);
  };
  const onKey = (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, PageDown: -15, PageUp: 30 }[e.key];
    if (step) {
      e.preventDefault();
      skip(step);
    } else if (e.key === "Home") seekTo(0);
    else if (e.key === "End") seekTo(0.999);
  };

  const s = seg();
  const meta = q.current.meta;

  // ---------- Lock screen / Control Center ("Now Playing") ----------
  // Tells the phone what's playing (title, show, cover art) and wires its buttons to the player.
  const actions = useRef({});
  actions.current = { toggle, skip, seekTo, startSeg, total };
  const msEp = s?.ep;
  const msKey = `${msEp?.id || ""}|${q.current.i}|${meta?.title || ""}`;

  // Fill in the Now Playing card. iPhone Safari wipes it every time a new audio file loads,
  // so this runs again once the audio is actually playing (see the listener below).
  const applyNowPlaying = useRef(() => {});
  applyNowPlaying.current = () => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !msEp) return;
    const ms = navigator.mediaSession;
    const origin = window.location.origin;
    const abs = (u) => (!u ? "" : u.startsWith("//") ? `https:${u}` : u.startsWith("/") ? origin + u : u);
    // Prefer the https version of each cover; keep the original as a fallback.
    const art = [...new Set([msEp.image, msEp.feedImage].map(abs).filter(Boolean).flatMap((u) => [u.replace(/^http:\/\//, "https://"), u]))];
    const album = meta ? `${meta.title} · clip ${q.current.i + 1} of ${q.current.segs.length}` : "Hooked on";
    if (audio.current) audio.current.title = `${msEp.title || ""} · ${msEp.feedTitle || ""}`;
    try {
      ms.metadata = new window.MediaMetadata({
        title: msEp.title || "",
        artist: msEp.feedTitle || "",
        album,
        artwork: [
          ...art.map((src) => ({ src, sizes: "600x600" })),
          { src: `${origin}/apple-icon.png`, sizes: "180x180", type: "image/png" },
        ],
      });
    } catch {}
    const set = (name, fn) => {
      try {
        ms.setActionHandler(name, fn);
      } catch {}
    };
    set("play", () => audio.current?.play().catch(() => {}));
    set("pause", () => audio.current?.pause());
    set("seekbackward", (d) => actions.current.skip(-(d?.seekOffset || 15)));
    set("seekforward", (d) => actions.current.skip(d?.seekOffset || 30));
    set("seekto", (d) => {
      const t = actions.current.total();
      const el = audio.current;
      if (d?.seekTime == null) return;
      if (q.current.meta && t) actions.current.seekTo(d.seekTime / t);
      else if (el?.duration) el.currentTime = d.seekTime;
    });
    // In a brief's cut, the track buttons jump between clips.
    const many = q.current.segs.length > 1;
    set("previoustrack", many ? () => actions.current.startSeg(Math.max(0, q.current.i - 1)) : null);
    set("nexttrack", many && q.current.i + 1 < q.current.segs.length ? () => actions.current.startSeg(q.current.i + 1) : null);
  };

  useEffect(() => {
    applyNowPlaying.current();
  }, [msKey]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const again = () => applyNowPlaying.current();
    el.addEventListener("playing", again);
    el.addEventListener("loadedmetadata", again);
    return () => {
      el.removeEventListener("playing", again);
      el.removeEventListener("loadedmetadata", again);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = !msEp ? "none" : playing ? "playing" : "paused";
  }, [playing, msEp]);

  // Keep the lock screen's progress bar in step (a few times a minute is plenty).
  const lastPos = useRef(0);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaSession?.setPositionState || !times.length) return;
    if (Math.abs(times.elapsed - lastPos.current) < 5 && times.elapsed > 1) return;
    lastPos.current = times.elapsed;
    try {
      navigator.mediaSession.setPositionState({
        duration: times.length,
        position: Math.min(times.elapsed, times.length),
        playbackRate: rate,
      });
    } catch {}
  }, [times, rate]);

  const hidden = !s || path.startsWith("/log/");
  const shown = drag ?? progress;
  const shownElapsed = drag !== null ? drag * times.length : times.elapsed;

  return (
    <PlayerContext.Provider value={{ play, playQueue, playItem, toggle, close, current: s?.ep || null, playing, queueMeta: meta }}>
      {children}
      <audio ref={audio} preload="none" />
      {!hidden && (
        <div className="mini">
          <div className="mini__inner">
            <div className="mini__top">
              <Art src={s.ep.image} title={s.ep.feedTitle} size={46} radius={10} episodeId={s.ep.id} />
              <div className="mini__text">
                {meta && (
                  <p className="mini__meta mono">
                    {meta.title} · clip {q.current.i + 1} of {q.current.segs.length}
                  </p>
                )}
                <Link href={`/episode/${s.ep.id}`} className="mini__title">
                  {s.ep.title}
                </Link>
                <p className="mini__show">{s.ep.feedTitle}</p>
              </div>
              <button className="mini__close" onClick={close} aria-label="Close player">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mini__scrub">
              <span className="mini__time mono">{clockTime(shownElapsed)}</span>
              <div
                className={`playhead playhead--live ${drag !== null ? "is-dragging" : ""}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={onKey}
                tabIndex={0}
                role="slider"
                aria-label="Playback position"
                aria-valuemin={0}
                aria-valuemax={Math.round(times.length)}
                aria-valuenow={Math.round(shownElapsed)}
                aria-valuetext={`${clockTime(shownElapsed)} of ${clockTime(times.length)}`}
              >
                <span className="playhead__fill" style={{ width: `${shown * 100}%` }} />
                <span className="playhead__knob" style={{ left: `${shown * 100}%` }} />
              </div>
              <span className="mini__time mono">-{clockTime(Math.max(0, times.length - shownElapsed))}</span>
            </div>

            <div className="mini__controls">
              <button className="mini__rate mono" onClick={cycleRate} aria-label={`Playback speed ${rate}x. Tap to change.`}>
                {rate}×
              </button>
              <button className="mini__jump" onClick={() => skip(-15)} aria-label="Back 15 seconds">
                <JumpIcon back />
              </button>
              <button className="mini__btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
              </button>
              <button className="mini__jump" onClick={() => skip(30)} aria-label="Forward 30 seconds">
                <JumpIcon />
              </button>
              {meta && q.current.i + 1 < q.current.segs.length ? (
                <button className="mini__skip" onClick={() => startSeg(q.current.i + 1)} aria-label="Next clip">
                  <NextIcon />
                </button>
              ) : (
                <span className="mini__spacer" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      )}
    </PlayerContext.Provider>
  );
}

const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];

function clockTime(sec = 0) {
  const t = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const r = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

// Circular arrow with the number of seconds inside: back 15 or forward 30.
function JumpIcon({ back = false }) {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
      {back ? (
        <>
          <path d="M8.5 9.5A10 10 0 1 1 6 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M8.8 4.5v5.6h5.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M23.5 9.5A10 10 0 1 0 26 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M23.2 4.5v5.6h-5.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      <text x="16" y="20.2" textAnchor="middle" fontSize="9.5" fontWeight="800" fontFamily="system-ui, sans-serif" fill="currentColor">
        {back ? "15" : "30"}
      </text>
    </svg>
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
