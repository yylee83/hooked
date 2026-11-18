"use client";
// "✓ Finished · log it?": takes the player's place when an episode reaches its last minute (lib/finished.js).
// Pick stars (optional), then Log it; "Hook show" beside it hooks the show (its own choice, Decision 6). It stays
// ("Saving…") until the log is saved, so a save that fails says so, then shows "✓ Logged" for a moment before the
// player comes back. ✕ sends it to "Finished, not logged" on My log.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Art from "./Art";
import Stars from "./Stars";
import { RatingInput } from "./LogSheet";
import { addLog, findLog, sameEpisode, useStore } from "@/lib/store";
import { HookShowPill } from "./Social";
import { logHref } from "@/lib/addresses";
import { askLater, doneFinished } from "@/lib/finished";

const STEP_ASIDE = 60_000; // once the next episode is playing, give the player back after a minute
const SHOW_DONE = 2_200; // how long "✓ Logged" stays before the player comes back

export default function FinishPrompt({ entry, current }) {
  const { ep } = entry;
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null); // { rating } once saved
  const [error, setError] = useState("");
  const movedOn = !!current && !sameEpisode(current, ep);
  const store = useStore();
  // Logged somewhere else (the log sheet, another device) while we were asking: nothing left to ask.
  const loggedElsewhere = !!findLog(store, ep) && !saving && !done;

  useEffect(() => {
    if (loggedElsewhere) doneFinished(ep);
  }, [loggedElsewhere, ep]);

  useEffect(() => {
    if (!movedOn || saving || done) return;
    const t = setTimeout(() => askLater(ep), STEP_ASIDE);
    return () => clearTimeout(t);
  }, [movedOn, saving, done, ep]);

  // After "✓ Logged" has been seen, give the player back.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => doneFinished(ep), SHOW_DONE);
    return () => clearTimeout(t);
  }, [done, ep]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await addLog({ ...ep, rating, hook: "" });
      setDone({ rating });
    } catch (e) {
      setError(`Couldn't save (${e?.message || "unknown error"}). Try again.`);
    }
    setSaving(false);
  }

  if (loggedElsewhere) return null;

  if (done) {
    return (
      <div className="mini finish-prompt">
        <div className="mini__inner finish-prompt__done" role="status">
          <p className="finish-prompt__done-line">
            <span>✓ Logged</span>
            {done.rating > 0 && <Stars value={done.rating} size={16} />}
          </p>
          <button className="finish-prompt__more" onClick={() => (doneFinished(ep), router.push("/me"))}>
            See it in My log ›
          </button>
        </div>
      </div>
    );
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
        <div className="finish-prompt__row">
          <HookShowPill episode={ep} short />
          <button className="btn btn--cobalt finish-prompt__save" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Log it"}
          </button>
        </div>
        {error && <p className="small finish-prompt__error">{error}</p>}
        <Link href={`${logHref(ep.ref, ep.id)}${rating ? `?stars=${rating}` : ""}`} className="finish-prompt__more" onClick={() => askLater(ep)}>
          Add what you thought ›
        </Link>
      </div>
    </div>
  );
}
