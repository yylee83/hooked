"use client";
// Step 3 of 3 after sign-up: how you heard about Hooked, and (optional) your city, picked from suggestions as you
// type (/api/places), so there are no misspellings. Both skippable.
// Saved privately in signup_answers (only you and the Hooked team see them).
import { useEffect, useState } from "react";
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
  const [typed, setTyped] = useState("");
  const [place, setPlace] = useState(null); // the suggestion picked: { label, place, country }
  const [options, setOptions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answered = heard || place;

  // Suggestions for what's typed, a moment after typing stops. Nothing to look up once one is picked.
  useEffect(() => {
    const q = typed.trim();
    if (place || q.length < 2) return setOptions([]);
    let live = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({ places: [] }));
      if (live) setOptions(res.places || []);
    }, 200);
    return () => ((live = false), clearTimeout(t));
  }, [typed, place]);

  async function done(skip) {
    setBusy(true);
    setError("");
    try {
      // Skipping still records the age check from sign-up.
      await saveSignupAnswers(skip ? {} : { heardFrom: heard, heardOther: other, place: place?.place, country: place?.country });
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
        Where are you? <span className="muted small signup-optional">your city</span>
      </label>
      <div className="welcome-q__place">
        <input
          id="place"
          className="input"
          autoComplete="off"
          maxLength={60}
          placeholder="Start typing, e.g. Brooklyn"
          value={place ? place.label : typed}
          onChange={(e) => (setPlace(null), setTyped(e.target.value))}
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls="place-options"
        />
        {options.length > 0 && (
          <ul className="welcome-q__options" id="place-options" role="listbox">
            {options.map((o) => (
              <li key={o.label}>
                <button type="button" role="option" aria-selected="false" onClick={() => (setPlace(o), setOptions([]))}>
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        {!place && typed.trim().length >= 2 && !options.length ? "No match yet. Try the nearest bigger city." : "Pick from the list. Never shown on your profile."}
      </p>

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
