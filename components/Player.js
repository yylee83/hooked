"use client";
// The player above the bottom bar. Its progress bar is the Hooked playhead.
// It can play one episode, or a queue of clips back to back (a brief's "cut").
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Art from "./Art";
import FinishPrompt from "./FinishPrompt";
import { findLog, getState, removeFromList, sameEpisode, setNowPlaying, upNext, useStore } from "@/lib/store";
import { episodeHref } from "@/lib/addresses";
import { clearLast, clearProgress, loadLast, resumeAt, saveLast, saveProgress } from "@/lib/progress";
import { flushSpots, pullSpots } from "@/lib/progress-sync";
import { markFinished, useFinished } from "@/lib/finished";
import { pullFinished } from "@/lib/finished-sync";

const FINISH = 60; // the last minute of an episode counts as finished

// Finished an episode (not a brief's clip) you haven't logged: ask "Log it?" (lib/finished.js).
// The player checks several times a second near the end, so each episode is handled once per visit.
const marked = new Set();
const finished = (ep) => {
  const key = ep?.ref || ep?.id;
  if (!key || marked.has(key)) return;
  marked.add(key);
  if (!findLog(getState(), ep)) markFinished(ep);
};

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
  // After a reload the player comes back paused, before its audio has loaded.
  // `pending` holds the spot (in seconds) to start from when you press play.
  const pending = useRef(null);
  const lastSaved = useRef(0);
  const path = usePathname() || "";
  const store = useStore();
  const userId = store?.user?.id || null;
  // The newest finished, unlogged episode still being asked about in the player.
  const asking = useFinished().find((f) => f.stage === "prompt" && !findLog(store, f.ep));

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
    pending.current = null;
    lastSaved.current = at;
    // Remember a single episode so it comes back after a reload. (A brief's cut doesn't.)
    if (q.current.meta) clearLast();
    else saveLast(s.ep);
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
    (segs, meta = null, offset = 0) => {
      if (!segs.length) return;
      q.current = { segs, i: 0, meta };
      setProgress(0);
      startSeg(0, offset);
    },
    [startSeg]
  );

  // Play/pause one episode, picking up where you left off.
  const play = useCallback(
    (ep) => {
      const el = audio.current;
      if (!el || !ep?.audio) return;
      const cur = seg();
      const same = !q.current.meta && sameEpisode(cur?.ep, ep);
      if (same && src.current === ep.audio) {
        el.paused ? el.play() : el.pause();
        return;
      }
      playQueue([{ ep, start: 0, end: null }], null, (same && pending.current) || resumeAt(ep));
    },
    [playQueue]
  );

  // Play something saved to Up next (those don't store the audio link, so look it up first).
  const playItem = useCallback(
    async (item) => {
      if (!item?.episodeRef && !item?.episodeId) return false;
      try {
        const q = item.episodeRef ? `ref=${encodeURIComponent(item.episodeRef)}` : `id=${item.episodeId}`;
        const res = await fetch(`/api/episode?${q}`);
        if (!res.ok) return false;
        const ep = await res.json();
        if (!ep.audio) return false;
        playQueue([{ ep, start: 0, end: null }], null, resumeAt(ep));
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
      const done = list.find((i) => sameEpisode({ ref: i.episodeRef, id: i.episodeId }, finished));
      if (!done) return;
      removeFromList(done);
      for (const item of list.filter((i) => i !== done)) {
        if (await playItem(item)) return;
      }
    },
    [playItem]
  );

  // Stop, unload and empty the player (without saving anything).
  const unload = useCallback(() => {
    const el = audio.current;
    pending.current = null;
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

  // Close the player: stop, unload, hide.
  const close = useCallback(() => {
    const el = audio.current;
    // Keep your spot in the episode, but don't bring the player back after a reload (or on another device).
    const cur = q.current.segs[q.current.i];
    if (el && cur && !q.current.meta && src.current === cur.ep.audio && el.readyState >= 1) saveProgress(cur.ep, el.currentTime, el.duration);
    clearLast();
    flushSpots();
    unload();
  }, [unload]);

  // Put an episode in the player, paused at your spot, without loading its audio yet.
  const showPaused = useCallback((ep) => {
    q.current = { segs: [{ ep, start: 0, end: null }], i: 0, meta: null };
    const t = resumeAt(ep);
    const d = ep.duration || 0;
    pending.current = t;
    setTimes({ elapsed: t, length: d });
    setProgress(d ? Math.min(1, t / d) : 0);
    force((n) => n + 1);
  }, []);

  const toggle = () => {
    const el = audio.current;
    const cur = seg();
    // Brought back after a reload: load the audio and start from the saved spot.
    if (el && cur && src.current !== cur.ep.audio) {
      startSeg(q.current.i, pending.current ?? resumeAt(cur.ep));
      return;
    }
    if (el) el.paused ? el.play().catch(() => {}) : el.pause();
  };

  // After a reload, bring back the episode you were on, paused at your spot.
  useEffect(() => {
    const ep = loadLast();
    if (!ep || q.current.segs.length) return;
    showPaused(ep);
  }, [showPaused]);

  // Signed in: when you open Hooked or come back to the tab, show what you played last on any device
  // (lib/progress-sync.js). Something playing here is never interrupted.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const isPlaying = () => audio.current && !audio.current.paused;
    const sync = async () => {
      const cur = q.current.segs[q.current.i];
      pullFinished(); // "Finished, not logged" from your other devices
      const r = await pullSpots(isPlaying() ? cur?.ep || {} : null);
      if (!alive || !r || isPlaying()) return;
      if (!r.ep) {
        if (q.current.segs.length && !q.current.meta) unload();
        return;
      }
      const now = q.current.segs[q.current.i];
      const el = audio.current;
      if (now && !q.current.meta && sameEpisode(now.ep, r.ep) && el && src.current === now.ep.audio && el.readyState >= 1) {
        // Same episode, already loaded here: just move to the newer spot.
        const t = resumeAt(r.ep);
        lastSaved.current = t; // came from your account: nothing new to save back
        el.currentTime = t;
        return;
      }
      if (src.current) unload();
      showPaused(r.ep);
    };
    sync();
    const onShow = () => document.visibilityState === "visible" && sync();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [userId, unload, showPaused]);

  // Save your spot when you pause, and when you leave the page or switch apps.
  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const save = () => {
      const cur = q.current.segs[q.current.i];
      if (!cur || q.current.meta || src.current !== cur.ep.audio || el.readyState < 1 || el.seeking) return;
      saveProgress(cur.ep, el.currentTime, el.duration);
      lastSaved.current = el.currentTime;
      // Stopped in the last minute: that's finished, same as playing to the very end, so don't bring the episode
      // back (at 0:00) next time you open Hooked, here or on another device.
      if (el.duration > FINISH && el.currentTime >= el.duration - FINISH) clearLast();
      flushSpots(); // pausing or leaving sends your spot to your account right away
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") save();
    };
    el.addEventListener("pause", save);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      el.removeEventListener("pause", save);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, []);

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
        // Finished: next time this episode starts from the top.
        if (!q.current.meta && segs[i]) {
          finished(segs[i].ep);
          clearProgress(segs[i].ep);
          clearLast();
        }
        el.pause();
        if (!q.current.meta) advanceUpNext(segs[i]?.ep);
      }
    };
    const onTime = () => {
      const s = seg();
      // Ignore the audio element while it isn't playing this episode (e.g. just emptied to swap episodes).
      if (!s || src.current !== s.ep.audio) return;
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
        if (end > FINISH && !el.paused && !el.seeking && el.currentTime >= end - FINISH) finished(s.ep);
        // Save your spot every 5 seconds of listening.
        if (src.current === s.ep.audio && el.readyState >= 1 && !el.seeking && Math.abs(el.currentTime - lastSaved.current) >= 5) {
          saveProgress(s.ep, el.currentTime, el.duration);
          lastSaved.current = el.currentTime;
        }
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
    } else if (seg() && src.current !== seg().ep.audio && times.length) {
      // Brought back after a reload and not loaded yet: just move the saved spot.
      const t = f * times.length;
      pending.current = t;
      setProgress(f);
      setTimes({ elapsed: t, length: times.length });
      saveProgress(seg().ep, t, times.length);
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
    } else if (seg() && src.current !== seg().ep.audio && times.length) {
      seekTo((times.elapsed + seconds) / times.length);
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
  const msKey = `${msEp?.ref || msEp?.id || ""}|${q.current.i}|${meta?.title || ""}`;

  // Fill in the Now Playing card. iPhone Safari wipes it every time a new audio file loads,
  // so this runs again once the audio is actually playing (see the listener below).
  const applyNowPlaying = useRef(() => {});
  applyNowPlaying.current = () => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !msEp) return;
    const ms = navigator.mediaSession;
    const origin = window.location.origin;
    const abs = (u) => (!u ? "" : u.startsWith("//") ? `https:${u}` : u.startsWith("/") ? origin + u : u);
    // iPhone Safari only uses the first image and often fails on huge or off-site covers,
    // so hand it one 512×512 copy served from this site.
    const cover = abs(msEp.image || msEp.feedImage || "");
    const art = cover && /^https?:\/\//.test(cover) ? `${origin}/_next/image?url=${encodeURIComponent(cover)}&w=512&q=75` : "";
    const album = meta ? `${meta.title} · clip ${q.current.i + 1} of ${q.current.segs.length}` : "Hooked";
    if (audio.current) audio.current.title = `${msEp.title || ""} · ${msEp.feedTitle || ""}`;
    try {
      ms.metadata = new window.MediaMetadata({
        title: msEp.title || "",
        artist: msEp.feedTitle || "",
        album,
        artwork: art
          ? [{ src: art, sizes: "512x512" }]
          : [{ src: `${origin}/apple-icon.png`, sizes: "180x180", type: "image/png" }],
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
    // Safari can drop the Now Playing card when the page goes to the background
    // (e.g. locking the phone), so put it back whenever the page hides or shows.
    document.addEventListener("visibilitychange", again);
    window.addEventListener("pageshow", again);
    return () => {
      el.removeEventListener("playing", again);
      el.removeEventListener("loadedmetadata", again);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("pageshow", again);
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
      {asking && !path.startsWith("/log/") && <FinishPrompt key={asking.at} entry={asking} current={s?.ep || null} />}
      {!hidden && !asking && (
        <div className="mini">
          <div className="mini__inner">
            <div className="mini__top">
              <Art src={s.ep.image} title={s.ep.feedTitle} size={46} radius={10} episodeRef={s.ep.ref} episodeId={s.ep.id} />
              <div className="mini__text">
                {meta && (
                  <p className="mini__meta mono">
                    {meta.title} · clip {q.current.i + 1} of {q.current.segs.length}
                  </p>
                )}
                <Link href={episodeHref(s.ep.ref, s.ep.id)} className="mini__title">
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
  const isThis = !p?.queueMeta && sameEpisode(p?.current, episode);
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
