"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Art from "./Art";
import { STAR_PATH } from "./Stars";
import { logHref } from "@/lib/addresses";
import { addLog, findLog, needsAccount, sendRecommendation, useStore } from "@/lib/store";
import { signInHref } from "@/lib/sign-in-first";
import { HookShowPill } from "./Social";
import { haptic } from "@/lib/haptics";
import { useGoBack } from "./BackButton";
import { episodeHref } from "@/lib/addresses";
import { CLEAN_CODE } from "@/lib/clean-words";

export function RatingInput({ value, onChange, size = 52 }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, ""); // two pickers on a page each need their own gradient ids
  // Tap the left half of a star for a half star, the right half for a full star.
  // Tapping your current rating again clears it. Arrow keys move by half a star.
  const pick = (n, e) => {
    const box = e.currentTarget.getBoundingClientRect();
    // Keyboard "clicks" have no position: treat them as the full star.
    const half = e.detail > 0 && e.clientX - box.left < box.width / 2;
    const next = half ? n - 0.5 : n;
    haptic();
    onChange(next === value ? 0 : next);
  };
  const onKeyDown = (e) => {
    const step = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[e.key];
    if (!step) return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(5, value + step)));
  };
  return (
    <div className="rating-row">
      <div className="rating" role="radiogroup" aria-label="Your rating" onKeyDown={onKeyDown}>
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = Math.max(0, Math.min(1, value - (n - 1)));
          const on = value > n - 1 && value <= n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (!value && n === 1) ? 0 : -1}
              className="rating__star"
              aria-label={on && value === n - 0.5 ? `${n - 0.5} stars` : `${n} star${n === 1 ? "" : "s"}`}
              onClick={(e) => pick(n, e)}
            >
              <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
                <defs>
                  <linearGradient id={`${uid}g${n}`}>
                    <stop offset={fill} stopColor="#2340FF" />
                    <stop offset={fill} stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path d={STAR_PATH} fill={`url(#${uid}g${n})`} stroke="#2340FF" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </button>
          );
        })}
      </div>
      <span className="rating__value mono" aria-live="polite">{value ? value : ""}</span>
    </div>
  );
}

// Stars and "What did you think?" rate the episode; hooking the show is its own choice (the pill under the show name,
// Decision 6). `presetRating` carries stars picked in the "Log it?" prompt over ("Add what you thought").
export default function LogSheet({ episode, presetRating = 0 }) {
  const router = useRouter();
  const cancel = useGoBack(episodeHref(episode.ref, episode.id)); // opened from a link: to the episode, not out of Hooked
  const state = useStore();
  const existing = findLog(state, episode);
  const [touched, setTouched] = useState(false);
  const [rating, setRating] = useState(presetRating);
  const [hook, setHook] = useState("");
  const [sendTo, setSendTo] = useState([]);

  // Fill in an earlier log of this episode, once, if there is one.
  if (existing && !touched) {
    setTouched(true);
    if (!presetRating) setRating(existing.rating || 0);
    setHook(existing.hook || "");
    setSendTo(existing.sentTo || []);
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [wordNote, setWordNote] = useState(""); // "Please edit out …", shown under the box
  const hookBox = useRef(null);

  // Logging needs an account: signed out, sign in first and come straight back here.
  const signedOut = needsAccount(state);
  useEffect(() => {
    if (signedOut) router.replace(signInHref(window.location.pathname + window.location.search));
  }, [signedOut, router]);
  if (signedOut) return null;

  async function save() {
    haptic("success");
    setSaving(true);
    setError("");
    setWordNote("");
    try {
      const review = { rating, hook: hook.trim() };
      await addLog({ ...episode, ...review, sentTo: sendTo });
      // Send to friends picked here (once each).
      const already = existing?.sentTo || [];
      const ids = (state?.following || []).filter((f) => sendTo.includes(f.handle) && !already.includes(f.handle)).map((f) => f.id);
      if (ids.length) await sendRecommendation(ids, episode, { review });
      router.push("/me");
    } catch (e) {
      setSaving(false);
      if (e?.code === CLEAN_CODE) {
        setWordNote(e.message);
        hookBox.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      setError(`Couldn't save that log (${e?.message || "unknown error"}). Try again in a moment.`);
    }
  }

  return (
    <div className="sheet">
      <header className="sheet__top">
        <button className="link-btn" onClick={cancel}>
          Cancel
        </button>
        <h1 className="display sheet__title">Log it</h1>
        <span style={{ width: 60 }} />
      </header>

      <div className="sheet__ep">
        <Art src={episode.image} title={episode.feedTitle} size={112} tilt={-3} radius={22} className="art--shadow" episodeRef={episode.ref} episodeId={episode.id} />
        <div>
          <h2 className="display sheet__epTitle">{episode.title}</h2>
          <p className="sheet__show">{episode.feedTitle}</p>
          <HookShowPill episode={episode} />
        </div>
      </div>

      <h3 className="display h-md cobalt">Your rating</h3>
      <p className="muted small" style={{ margin: "0 0 6px" }}>Tap the left half of a star for a half star.</p>
      <RatingInput value={rating} onChange={setRating} />

      <h3 className="label">What did you think?</h3>
      <textarea
        className="input textarea"
        rows={4}
        maxLength={280}
        placeholder="One line. What got you?"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        value={hook}
        onChange={(e) => (setHook(e.target.value), setWordNote(""))}
        ref={hookBox}
      />
      {wordNote && (
        <p className="nudge small" role="alert">
          {wordNote}
        </p>
      )}

      <h3 className="label">Send it to a friend</h3>
      {state?.user && state.following?.length > 0 ? (
        <div className="row gap wrap">
          {state.following.map((f) => {
            const on = sendTo.includes(f.handle);
            const sent = existing?.sentTo?.includes(f.handle);
            return (
              <button
                key={f.id}
                className={`chip ${on ? "chip--on" : ""}`}
                disabled={sent}
                title={sent ? "Already sent" : undefined}
                onClick={() => setSendTo(on ? sendTo.filter((x) => x !== f.handle) : [...sendTo, f.handle])}
              >
                {sent ? "✓ " : ""}@{f.handle}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="muted small">
          {state?.user ? (
            <>
              Follow friends to send them episodes. <Link href="/people" className="u-link">Find friends</Link>
            </>
          ) : (
            <>
              <Link href={`/login?next=${logHref(episode.ref, episode.id)}`} className="u-link">Sign in</Link> to send this to friends.
            </>
          )}
        </p>
      )}

      <button className="btn btn--big btn--display btn--cobalt sheet__save" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Log it"}
      </button>
      {error && <p className="nudge" style={{ marginTop: 14 }}>{error}</p>}
    </div>
  );
}
