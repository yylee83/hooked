"use client";
// First-run taste picker: topics you like, then a few shows you're already hooked on.
// Powers "For you" on Home until your log can speak for itself.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Art from "./Art";
import { GENRES } from "@/lib/genres";
import { saveInterests, toggleHookedShow, useStore } from "@/lib/store";

export default function TastePicker({ shows }) {
  const state = useStore();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const topics = picked ?? state?.interests ?? [];

  const flip = (k) => setPicked(topics.includes(k) ? topics.filter((x) => x !== k) : [...topics, k]);

  // Shows in your topics first, then everything else on the chart.
  const ordered = [...shows.filter((s) => topics.includes(s.genreKey)), ...shows.filter((s) => !topics.includes(s.genreKey))].slice(0, 24);
  const hookedCount = shows.filter((s) => state?.shows[s.feedId]).length;

  async function finish() {
    setBusy(true);
    await saveInterests(topics);
    router.push("/#for-you");
  }

  return (
    <div className="taste">
      <p className="mono small cobalt">Step {step} of 2</p>
      {step === 1 ? (
        <>
          <h1 className="display h-lg">What are you into?</h1>
          <p className="muted" style={{ margin: "8px 0 18px", fontSize: 18 }}>Pick a few. We'll use them to find you episodes worth your time.</p>
          <div className="taste__topics">
            {GENRES.map((g) => (
              <button key={g.key} className={`chip ${topics.includes(g.key) ? "chip--on" : ""}`} onClick={() => flip(g.key)} aria-pressed={topics.includes(g.key)}>
                {g.label}
              </button>
            ))}
          </div>
          <button className="btn btn--big btn--display btn--cobalt btn--shadow-sm taste__next" disabled={!topics.length} onClick={() => setStep(2)}>
            {topics.length ? "Next" : "Pick at least one"}
          </button>
        </>
      ) : (
        <>
          <h1 className="display h-lg">Already hooked on any of these?</h1>
          <p className="muted" style={{ margin: "8px 0 18px", fontSize: 18 }}>
            Tap the shows you love. We'll tell you when they put out something good. Skip if none fit.
          </p>
          <div className="taste__shows">
            {ordered.map((s) => {
              const on = !!state?.shows[s.feedId];
              return (
                <button
                  key={s.feedId}
                  className={`taste__show ${on ? "is-on" : ""}`}
                  onClick={() => toggleHookedShow({ feedId: s.feedId, title: s.title, image: s.image })}
                  aria-pressed={on}
                >
                  <Art src={s.image} title={s.title} size="100%" radius={16} className="art--fluid" />
                  {on && <span className="taste__check" aria-hidden="true">✓</span>}
                  <span className="taste__title">{s.title}</span>
                </button>
              );
            })}
          </div>
          <div className="taste__bar">
            <button className="link-btn" onClick={() => setStep(1)}>← Topics</button>
            <button className="btn btn--display btn--cobalt btn--shadow-sm" onClick={finish} disabled={busy}>
              {busy ? "Saving…" : hookedCount ? `Done · ${hookedCount} picked` : "Done"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
