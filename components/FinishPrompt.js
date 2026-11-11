"use client";
// "✓ Finished · log it?": takes the player's place when an episode reaches its last minute (lib/finished.js).
// Stars are optional; Hooked or Not hooked saves the log. ✕ sends it to "Finished, not logged" on Home.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { RatingInput } from "./LogSheet";
import { addLog, sameEpisode } from "@/lib/store";
import { logHref } from "@/lib/addresses";
import { askLater, doneFinished } from "@/lib/finished";

const STEP_ASIDE = 60_000; // once the next episode is playing, give the player back after a minute

export default function FinishPrompt({ entry, current }) {
  const { ep } = entry;
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const movedOn = !!current && !sameEpisode(current, ep);

  useEffect(() => {
    if (!movedOn || saving) return;
    const t = setTimeout(() => askLater(ep), STEP_ASIDE);
    return () => clearTimeout(t);
  }, [movedOn, saving, ep]);

  async function save(hooked) {
    setSaving(true);
    setError("");
    try {
      await addLog({ ...ep, hooked, rating, hook: "" });
      doneFinished(ep);
    } catch (e) {
      setSaving(false);
      setError(`Couldn't save (${e?.message || "unknown error"}). Try again.`);
    }
  }

  return (
    <div className="mini finish-prompt">
      <div className="mini__inner">
        <div className="finish-prompt__head">
          <p className="finish-prompt__label mono">✓ Finished · log it?</p>
          <button className="mini__close" onClick={() => askLater(ep)} aria-label="Not now">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mini__top">
          <Art src={ep.image} title={ep.feedTitle} size={46} radius={10} episodeRef={ep.ref} episodeId={ep.id} />
          <div className="mini__text">
            <p className="mini__title">{ep.title}</p>
            <p className="mini__show">{ep.feedTitle}</p>
          </div>
        </div>
        <div className="finish-prompt__stars">
          <RatingInput value={rating} onChange={setRating} size={36} />
        </div>
        <div className="finish-prompt__choice">
          <button className="btn btn--butter" disabled={saving} onClick={() => save(true)}>
            Hooked
          </button>
          <button className="btn" disabled={saving} onClick={() => save(false)}>
            Not hooked
          </button>
        </div>
        {error && <p className="small finish-prompt__error">{error}</p>}
        <Link href={logHref(ep.ref, ep.id)} className="finish-prompt__more" onClick={() => askLater(ep)}>
          Add a hook line ›
        </Link>
      </div>
    </div>
  );
}
