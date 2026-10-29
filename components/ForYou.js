"use client";
// "For you" on Home. Built from your log, the shows you're hooked on, friends, and your topics.
import Link from "next/link";
import { useEffect, useState } from "react";
import Art from "./Art";
import { PlayButton } from "./Player";
import { QueueButton } from "./Social";
import { useStore } from "@/lib/store";

function inputsFrom(state) {
  // Ordered: shows you're hooked on first (newest first), then shows you rate highly.
  const loved = {};
  const hooked = Object.values(state.shows || {}).sort((a, b) => (b.at || 0) - (a.at || 0));
  for (const s of hooked) loved[s.feedId] = "You're hooked on it";
  // Shows you rated well (average 4★+) count too.
  const by = {};
  for (const l of state.logs) {
    if (!l.feedId || !(l.rating > 0)) continue;
    (by[l.feedId] ||= { title: l.feedTitle, r: [] }).r.push(l.rating);
  }
  const rated = Object.entries(by)
    .map(([id, v]) => [id, v.r.reduce((a, b) => a + b, 0) / v.r.length])
    .filter(([, avg]) => avg >= 4)
    .sort((a, b) => b[1] - a[1]);
  for (const [id, avg] of rated) if (!loved[id]) loved[id] = `You rate it ${avg.toFixed(1)}★`;
  return {
    loved: Object.entries(loved), // [feedId, reason], in priority order
    logged: state.logs.map((l) => l.id),
    shows: [...new Set([...state.logs.map((l) => l.feedId), ...Object.keys(state.shows || {})])].filter(Boolean),
    genres: state.interests || [],
    friends: (state.following || []).map((f) => f.id),
  };
}

export default function ForYou({ compact = false }) {
  const state = useStore();
  const [picks, setPicks] = useState(null);
  const inputs = state ? inputsFrom(state) : null;
  const key = inputs ? JSON.stringify(inputs) : "";
  const hasTaste = !!inputs && (inputs.loved.length || inputs.genres.length || inputs.friends.length || inputs.logged.length);

  useEffect(() => {
    if (!key || !hasTaste) return;
    let live = true;
    fetch("/api/for-you", { method: "POST", headers: { "Content-Type": "application/json" }, body: key })
      .then((r) => (r.ok ? r.json() : { picks: [] }))
      .then((d) => live && setPicks(d.picks || []))
      .catch(() => live && setPicks([]));
    return () => {
      live = false;
    };
  }, [key, hasTaste]);

  if (!state) return null;

  if (!hasTaste) {
    return (
      <section id="for-you" className={`card taste-cta ${compact ? "taste-cta--sm" : ""}`}>
        <p className="display h-md" style={{ margin: 0 }}>Get picks made for you.</p>
        <p style={{ margin: "8px 0 14px" }}>Tell us what you're into and the shows you already love. Takes 30 seconds.</p>
        <Link href="/welcome" className="btn btn--cobalt btn--shadow-sm">
          Pick my topics
        </Link>
      </section>
    );
  }

  return (
    <section id="for-you" style={compact ? { marginTop: 28 } : undefined}>
      <div className="row center" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className={compact ? "label" : "section-title"}>For you</h2>
        <Link href="/welcome" className="more-link">Tune it →</Link>
      </div>
      {picks === null ? (
        <div className="foryou">
          {[0, 1, 2].map((i) => (
            <div key={i} className="foryou__card foryou__card--ghost" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <p className="muted">No picks yet. Log a few episodes or follow friends and they'll show up here.</p>
      ) : (
        <div className="foryou">
          {picks.map((ep) => (
            <article key={ep.id} className="foryou__card">
              <span className="foryou__why mono">{ep.reason}</span>
              <Art src={ep.image} title={ep.feedTitle} size="100%" radius={14} className="art--fluid" episodeId={ep.id} />
              <Link href={`/episode/${ep.id}`} className="foryou__title">
                {ep.title}
              </Link>
              <p className="muted small foryou__show">{ep.feedTitle}</p>
              <div className="row gap-xs foryou__actions">
                <PlayButton episode={ep} />
                <QueueButton episode={ep} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
