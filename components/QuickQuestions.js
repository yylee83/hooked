"use client";
// Step 3 of 3 after sign-up: how you heard about Hooked, and (optional) your city. Both skippable.
// Saved privately in signup_answers (only you and the Hooked team see them).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSignupAnswers } from "@/lib/store";

const SOURCES = [
  ["friend", "A friend"],
  ["invite", "An invite email"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["x", "X"],
  ["podcast", "A podcast"],
  ["article", "An article"],
  ["search", "Search"],
  ["other", "Something else"],
];

export default function QuickQuestions() {
  const router = useRouter();
  const [heard, setHeard] = useState("");
  const [other, setOther] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answered = heard || place.trim();

  async function done(skip) {
    setBusy(true);
    setError("");
    try {
      // Skipping still records the age check from sign-up.
      await saveSignupAnswers(skip ? {} : { heardFrom: heard, heardOther: other, place });
      router.push("/");
    } catch (e) {
      if (skip) return router.push("/");
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="welcome-q">
      <p className="mono small cobalt">Step 3 of 3</p>
      <h1 className="display h-lg">Two quick questions</h1>
      <p className="muted" style={{ margin: "8px 0 18px", fontSize: 18 }}>Both optional. Only the Hooked team sees them.</p>

      <p className="label">How did you hear about Hooked?</p>
      <div className="welcome-q__chips">
        {SOURCES.map(([k, label]) => (
          <button key={k} type="button" className={`chip chip--sm ${heard === k ? "chip--on" : ""}`} aria-pressed={heard === k} onClick={() => setHeard(heard === k ? "" : k)}>
            {label}
          </button>
        ))}
      </div>
      {heard === "other" && (
        <input className="input" style={{ marginTop: 10 }} maxLength={120} placeholder="Where?" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Where did you hear about Hooked?" />
      )}

      <label className="label" htmlFor="place" style={{ display: "block", marginTop: 26 }}>
        Where are you? <span className="muted small signup-optional">city or country</span>
      </label>
      <input id="place" className="input" maxLength={80} autoComplete="address-level2" placeholder="e.g. Brooklyn" value={place} onChange={(e) => setPlace(e.target.value)} />
      <p className="muted small" style={{ margin: "6px 0 0" }}>Helps us find local shows. Never shown on your profile.</p>

      {error && <p className="nudge" role="alert">{error}</p>}
      <div className="welcome-q__bar">
        <button type="button" className="link-btn" onClick={() => done(true)} disabled={busy}>
          Skip
        </button>
        <button type="button" className="btn btn--display btn--cobalt btn--shadow-sm" onClick={() => done(false)} disabled={busy || !answered}>
          {busy ? "Saving…" : "Done"}
        </button>
      </div>
    </div>
  );
}
