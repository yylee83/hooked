"use client";
// Home: "New episodes from shows you listen to", a swipe row of small cards with play and + Up next icons. "Shows you
// listen to" (YY, 2026-11-22): shows you've hooked, shows with an episode you rated 4+ stars, and shows you've played at
// least 5 minutes of in Hooked's player (lib/my-listening.js, signed in only), in that order.
// Signed out, or with none of those, the row is left out (YY, 2026-11-22: "popular on Hooked" repeated Trending
// episodes). Data: /api/new-episodes.
// The last row shown is remembered on this device (`hooked:new-eps`, with whose it was), so Home shows it at once and
// swaps in the fresh list when it arrives, instead of blank tiles while the account and the episodes load.
import Link from "next/link";
import { useEffect, useState } from "react";
import Art from "./Art";
import { PlayButton } from "./Player";
import { QueueButton } from "./Social";
import { hookedShows, useStore } from "@/lib/store";
import { episodeHref } from "@/lib/addresses";
import { shortDate } from "@/lib/format";
import { useMyListening } from "@/lib/my-listening";
import { useRefreshTick } from "@/lib/home-refresh";

const SAVED = "hooked:new-eps";
const LOVED = 4; // stars: a rating this high counts the show as one you listen to
const PLAYED = 5 * 60; // seconds played in Hooked's player, across the show's episodes
const MAX_SHOWS = 20;

// Your shows, most important first: hooked, then loved (newest rating first), then most played.
function yourShows(state, listening) {
  const hooked = hookedShows(state).map((s) => s.showRef || s.feedId);
  const loved = [...state.logs]
    .filter((l) => Number(l.rating) >= LOVED)
    .sort((a, b) => (b.loggedAt || 0) - (a.loggedAt || 0))
    .map((l) => l.showRef || l.feedId);
  const played = (listening?.shows || []).filter((s) => s.seconds >= PLAYED).map((s) => s.id);
  const ids = [...hooked, ...loved, ...played].filter((x) => x != null && x !== "").map(String);
  return [...new Set(ids)].slice(0, MAX_SHOWS);
}
const SAVED_FOR = 3 * 86400 * 1000; // older than 3 days: not worth showing, even for a second

// "Today", "Yesterday", "3d ago", then the date (short: it sits beside two buttons on a small card).
function released(unixSeconds) {
  if (!unixSeconds) return "";
  const days = Math.floor((Date.now() / 1000 - unixSeconds) / 86400);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return shortDate(unixSeconds);
}

function readSaved() {
  try {
    const s = JSON.parse(window.localStorage.getItem(SAVED) || "null");
    if (s && Array.isArray(s.episodes) && Date.now() - (s.at || 0) < SAVED_FOR) return s;
  } catch {}
  return null;
}

function save(who, data) {
  try {
    window.localStorage.setItem(SAVED, JSON.stringify({ who, mode: data.mode, episodes: data.episodes.slice(0, 12), at: Date.now() }));
  } catch {}
}

export default function NewEpisodes() {
  const state = useStore();
  const [data, setData] = useState(null); // { mode, episodes }: the fresh answer
  const [saved, setSaved] = useState(null); // the last answer on this device, until the fresh one arrives
  const tick = useRefreshTick();
  const who = state ? state.user?.id || "out" : null;
  const listening = useMyListening(state?.user?.id);
  // Signed in, wait for your listening totals so the row is asked for once, with all your shows.
  const ready = state && !(state.user && listening === undefined);
  const shows = ready && state.user ? yourShows(state, listening) : [];
  const logged = state ? state.logs.map((l) => String(l.ref || l.id || "")).filter(Boolean) : [];
  const key = shows.length ? JSON.stringify({ shows, logged }) : "";

  // Read after the first render (the server has no saved row), so the page the server sent and this one match.
  useEffect(() => setSaved(readSaved()), []);

  useEffect(() => {
    if (!key) return;
    let live = true;
    fetch("/api/new-episodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: key })
      .then((r) => (r.ok ? r.json() : { episodes: [] }))
      .then((d) => {
        if (!live) return;
        setData(d);
        if (Array.isArray(d.episodes)) save(who, d);
      })
      .catch(() => live && setData({ episodes: [] }));
    return () => {
      live = false;
    };
  }, [key, who, tick]);

  // Someone else's saved row (another account, or from before signing in/out) is never shown.
  const usable = saved && (who === null || saved.who === who) ? saved : null;
  const shown = data || usable;
  // Only for signed-in people with shows of their own. Before the account loads, only a saved row of theirs shows.
  if (ready ? !shows.length : usable?.mode !== "hooked") return null;

  const episodes = shown?.episodes || [];

  return (
    <section className="new-eps">
      <h2 className="section-title">New episodes from shows you listen to</h2>
      {!shown ? (
        <div className="new-eps__row" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="new-eps__card new-eps__card--ghost" aria-hidden="true">
              <span className="new-eps__ghost-art" />
              <span className="new-eps__ghost-line" />
              <span className="new-eps__ghost-line new-eps__ghost-line--short" />
            </div>
          ))}
        </div>
      ) : !episodes.length ? (
        <p className="muted">Nothing new from your shows yet. You’ve caught up.</p>
      ) : (
        <div className="new-eps__row">
          {episodes.map((ep) => (
            <article key={ep.ref || ep.id} className="new-eps__card">
              <Art src={ep.image} title={ep.feedTitle} size="100%" radius={12} className="art--fluid" episodeRef={ep.ref} episodeId={ep.id} />
              <Link href={episodeHref(ep.ref, ep.id)} className="new-eps__title">
                {ep.title}
              </Link>
              <p className="new-eps__show">{ep.feedTitle}</p>
              <div className="new-eps__foot">
                {ep.date > 0 && <span className="new-eps__when mono">{released(ep.date)}</span>}
                <span className="new-eps__acts">
                  <PlayButton episode={ep} icon />
                  <QueueButton episode={ep} icon />
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
