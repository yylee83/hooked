"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Art from "./Art";
import { STAR_PATH } from "./Stars";
import { addLog, useStore } from "@/lib/store";
import { friendsToSendTo } from "@/lib/demo";

function RatingInput({ value, onChange }) {
  // Tap a star to rate. Tap the same star again for a half star.
  return (
    <div className="rating" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <button
            key={n}
            type="button"
            className="rating__star"
            aria-label={`${n} stars`}
            onClick={() => onChange(value === n ? n - 0.5 : value === n - 0.5 ? 0 : n)}
          >
            <svg viewBox="0 0 24 24" width="52" height="52" aria-hidden="true">
              <defs>
                <linearGradient id={`g${n}`}>
                  <stop offset={fill} stopColor="#2340FF" />
                  <stop offset={fill} stopColor="transparent" />
                </linearGradient>
              </defs>
              <path d={STAR_PATH} fill={`url(#g${n})`} stroke="#2340FF" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

export default function LogSheet({ episode, preset }) {
  const router = useRouter();
  const state = useStore();
  const existing = state?.logs.find((l) => l.id === episode.id);
  const [touched, setTouched] = useState(false);
  const [hooked, setHooked] = useState(preset);
  const [rating, setRating] = useState(0);
  const [hook, setHook] = useState("");
  const [sendTo, setSendTo] = useState([]);
  const [nudge, setNudge] = useState(false);

  // Fill in an earlier log of this episode, once, if there is one.
  if (existing && !touched) {
    setTouched(true);
    if (preset === undefined) setHooked(existing.hooked);
    setRating(existing.rating || 0);
    setHook(existing.hook || "");
    setSendTo(existing.sentTo || []);
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (hooked === undefined) {
      setNudge(true);
      setError("Pick “I'm hooked” or “I'm not hooked” at the top first.");
      document.getElementById("hooked-choice")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    setError("");
    try {
      await addLog({ ...episode, hooked, rating, hook: hook.trim(), sentTo: sendTo });
      router.push("/me");
    } catch (e) {
      setSaving(false);
      setError(`Couldn't save that log (${e?.message || "unknown error"}). Try again in a moment.`);
    }
  }

  return (
    <div className="sheet">
      <header className="sheet__top">
        <button className="link-btn" onClick={() => router.back()}>
          Cancel
        </button>
        <h1 className="display sheet__title">Log it</h1>
        <span style={{ width: 60 }} />
      </header>

      <div className="sheet__ep">
        <Art src={episode.image} title={episode.feedTitle} size={112} tilt={-3} radius={22} className="art--shadow" episodeId={episode.id} />
        <div>
          <h2 className="display sheet__epTitle">{episode.title}</h2>
          <p className="sheet__show">{episode.feedTitle}</p>
        </div>
      </div>

      <h3 className="display h-md">Are you hooked?</h3>
      <div className="choice" id="hooked-choice">
        <button className={`btn btn--display ${hooked === true ? "btn--cobalt is-on" : ""}`} onClick={() => (setHooked(true), setNudge(false), setError(""))}>
          I'm hooked
        </button>
        <button className={`btn btn--display ${hooked === false ? "btn--ink is-on" : ""}`} onClick={() => (setHooked(false), setNudge(false), setError(""))}>
          I'm not hooked
        </button>
      </div>
      <p className={`muted small ${nudge ? "nudge" : ""}`}>
        {nudge ? "Pick one first. Not hooked is just as valid." : "Hooked shows go on your profile and into your friends' feeds."}
      </p>

      <h3 className="label">Your rating</h3>
      <RatingInput value={rating} onChange={setRating} />

      <h3 className="display h-md cobalt">What's the hook?</h3>
      <textarea
        className="input textarea"
        rows={4}
        maxLength={280}
        placeholder="One line. What got you?"
        value={hook}
        onChange={(e) => setHook(e.target.value)}
      />

      <h3 className="label">Send it to a friend</h3>
      <div className="row gap wrap">
        {friendsToSendTo.map((f) => {
          const on = sendTo.includes(f);
          return (
            <button
              key={f}
              className={`chip ${on ? "chip--on" : ""}`}
              onClick={() => setSendTo(on ? sendTo.filter((x) => x !== f) : [...sendTo, f])}
            >
              {f}
            </button>
          );
        })}
      </div>

      <button className="btn btn--big btn--display btn--cobalt sheet__save" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Log it"}
      </button>
      {error && <p className="nudge" style={{ marginTop: 14 }}>{error}</p>}
      {state?.accounts && !state.user && (
        <p className="muted small" style={{ marginTop: 14, textAlign: "center" }}>
          Saved on this device for now. <Link href={`/login?mode=signup&next=/log/${episode.id}`} className="u-link">Make a profile</Link> to keep it everywhere.
        </p>
      )}
    </div>
  );
}
