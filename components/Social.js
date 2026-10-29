"use client";
import { useState } from "react";
import { addToList, removeFromList, toggleHookedShow, useStore } from "@/lib/store";

// "+ Up next" / "Not for me" on a friend's recommendation.
export function RecActions({ item }) {
  const state = useStore();
  const [dismissed, setDismissed] = useState(false);
  const key = item.episodeId || item.title;
  const saved = state?.list.some((i) => (i.episodeId || i.title) === key);
  if (dismissed) return <p className="muted small">Got it. Fewer like this.</p>;
  return (
    <div className="row gap">
      <button
        className={`btn btn--shadow-sm ${saved ? "btn--butter" : "btn--cobalt"}`}
        onClick={() => (saved ? removeFromList(item) : addToList(item))}
      >
        {saved ? "✓ Up next" : "+ Up next"}
      </button>
      {!saved && (
        <button className="btn" onClick={() => setDismissed(true)}>
          Not for me
        </button>
      )}
    </div>
  );
}

const REACTIONS = [
  { key: "ooh", cls: "react--ooh" },
  { key: "same", cls: "react--same" },
  { key: "on my list", cls: "react--list" },
  { key: "hard disagree", cls: "react--disagree" },
];

// Friends don't "like" a log. They react to it.
export function Reactions({ counts = {} }) {
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(false);
  const shown = REACTIONS.filter((r) => (counts[r.key] || 0) > 0 || mine === r.key || open);
  return (
    <div className="row gap wrap">
      {shown.map((r) => {
        const n = (counts[r.key] || 0) + (mine === r.key ? 1 : 0);
        return (
          <button
            key={r.key}
            className={`react ${r.cls} ${mine === r.key ? "is-mine" : ""}`}
            onClick={() => {
              setMine(mine === r.key ? null : r.key);
              setOpen(false);
            }}
          >
            {r.key}
            {n > 0 && <span className="react__n">{n}</span>}
          </button>
        );
      })}
      {!open && (
        <button className="react react--add" onClick={() => setOpen(true)} aria-label="Add a reaction">
          + react
        </button>
      )}
    </div>
  );
}

// The "I'm hooked on this show" toggle on a show page.
export function HookShowButton({ show }) {
  const state = useStore();
  const on = !!state?.shows[show.feedId];
  return (
    <button
      className={`btn btn--display btn--shadow-sm ${on ? "btn--cobalt" : ""}`}
      onClick={() => toggleHookedShow(show)}
      aria-pressed={on}
    >
      {on ? "I'm hooked on this" : "Hooked on this?"}
    </button>
  );
}

// "+ Up next" on any episode: saves it to your queue (it plays after whatever's on).
export function QueueButton({ episode, from }) {
  const state = useStore();
  const item = {
    episodeId: episode.id,
    title: episode.title,
    feedId: episode.feedId,
    feedTitle: episode.feedTitle,
    image: episode.image || episode.feedImage,
    ...(from ? { from } : {}),
  };
  const on = !!state?.list.some((i) => String(i.episodeId) === String(episode.id));
  return (
    <button
      className={`btn btn--sm ${on ? "btn--butter" : ""}`}
      onClick={() => (on ? removeFromList(item) : addToList(item))}
      aria-pressed={on}
      title={on ? "Remove from Up next" : "Add to Up next"}
    >
      {on ? "✓ Up next" : "+ Up next"}
    </button>
  );
}

// "Queue all 4" at the bottom of a brief.
export function QueueAll({ items, tone }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`btn btn--big btn--display ${tone === "cobalt" ? "btn--butter" : "btn--cobalt"}`}
      onClick={() => {
        items.forEach((i) => addToList(i));
        setDone(true);
      }}
    >
      {done ? "Added to Up next. See My log." : `Add all ${items.length} to Up next`}
    </button>
  );
}
