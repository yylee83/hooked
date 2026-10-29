"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Art from "./Art";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { briefSeconds, clipSeconds, clock } from "@/lib/clips";
import { minutes, shortDate } from "@/lib/format";

const DRAFT = "hooked:brief-draft";
const COLORS = ["cobalt", "bubblegum", "butter"];

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export default function BriefBuilder({ initialTopic = "" }) {
  const router = useRouter();
  const state = useStore();
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("clips");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { topic, mode, items }
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState("");
  const [dek, setDek] = useState("");
  const [color, setColor] = useState("cobalt");
  const [saving, setSaving] = useState(false);

  // Bring back a draft (e.g. after signing in to publish), or start from a trending topic.
  useEffect(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem(DRAFT) || "null");
      if (initialTopic && (!d || d.topic !== initialTopic)) {
        setTopic(initialTopic);
        find(null, null, initialTopic);
        return;
      }
      if (d) {
        setTopic(d.topic);
        setMode(d.mode);
        setResult(d.result);
        setPicked(d.picked);
        setTitle(d.title);
        setDek(d.dek);
        setColor(d.color);
      }
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function find(e, forceMode, forceTopic) {
    e?.preventDefault();
    const m = forceMode || mode;
    const t = (forceTopic || topic).trim();
    if (forceMode) setMode(forceMode);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`/api/briefs/draft?${new URLSearchParams({ topic: t, mode: m })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setResult(data);
      const withClips = data.items.filter((x) => x.clips?.length);
      const first = (m === "clips" && withClips.length ? withClips : data.items).slice(0, m === "clips" ? 5 : 4);
      setPicked(first.map((x) => x.episodeId));
      if (!title) setTitle(titleCase(t));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const chosen = useMemo(() => (result ? result.items.filter((x) => picked.includes(x.episodeId)) : []), [result, picked]);
  const total = briefSeconds(chosen, result?.mode);
  const clipCount = result?.mode === "clips" ? result.items.filter((x) => x.clips?.length).length : 0;

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 12 ? p : [...p, id]));
  }

  async function publish() {
    if (!state?.user) {
      try {
        sessionStorage.setItem(DRAFT, JSON.stringify({ topic, mode, result, picked, title, dek, color }));
      } catch {}
      router.push("/login?next=/briefs/new");
      return;
    }
    setSaving(true);
    setError("");
    const items = chosen.map((x) => ({
      episodeId: x.episodeId,
      feedId: x.feedId,
      show: x.show,
      episode: x.episode,
      image: x.image,
      audio: x.audio,
      duration: x.duration,
      transcript: x.transcript,
      clips: result.mode === "clips" ? x.clips : null,
    }));
    const { data, error: err } = await supabase()
      .from("briefs")
      .insert({
        title: title.trim().slice(0, 80) || titleCase(result.topic),
        dek: dek.trim() || null,
        topic: result.topic,
        color,
        mode: result.mode,
        items,
        total_seconds: Math.round(briefSeconds(items, result.mode)),
      })
      .select("id")
      .single();
    if (err) {
      setSaving(false);
      setError(state.profile?.handle ? `Couldn't publish (${err.message}). Try again in a moment.` : "Pick a handle on My log first, then publish.");
      return;
    }
    try {
      sessionStorage.removeItem(DRAFT);
    } catch {}
    router.push(`/briefs/b/${data.id}`);
  }

  return (
    <>
      <Link href="/briefs" className="back">
        ← Briefs
      </Link>
      <h1 className="display h-lg" style={{ margin: "18px 0 8px" }}>
        New brief
      </h1>
      <p className="muted" style={{ fontSize: 19 }}>
        Pick a topic. We'll find episodes about it, and if you want, just the parts where it comes up.
      </p>

      <form onSubmit={find} className="stack" style={{ marginTop: 22 }}>
        <input
          className="input"
          placeholder="A person or topic, like Kara Swisher"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          required
          minLength={2}
          maxLength={80}
        />
        <div className="mode">
          <button type="button" className={`mode__opt ${mode === "clips" ? "is-on" : ""}`} onClick={() => setMode("clips")} aria-pressed={mode === "clips"}>
            <span className="display">Just the parts</span>
            <span>Cut each episode down to where the topic comes up, then play them back to back.</span>
          </button>
          <button type="button" className={`mode__opt ${mode === "full" ? "is-on" : ""}`} onClick={() => setMode("full")} aria-pressed={mode === "full"}>
            <span className="display">Whole episodes</span>
            <span>Pick full episodes about the topic.</span>
          </button>
        </div>
        <button className="btn btn--cobalt btn--shadow-sm" disabled={loading || topic.trim().length < 2}>
          {loading ? (mode === "clips" ? "Reading transcripts…" : "Finding episodes…") : "Find episodes"}
        </button>
      </form>

      {error && <p className="nudge" style={{ marginTop: 14 }}>{error}</p>}

      {result && (
        <section>
          <h2 className="label">
            {result.items.length ? `${result.items.length} episodes mention “${result.topic}”` : `Nothing found for “${result.topic}”`}
          </h2>

          {result.mode === "clips" && result.items.length > 0 && clipCount === 0 && (
            <div className="notice">
              <p>
                None of these publish a timed transcript that mentions “{result.topic}”, so there's nothing to cut yet. You can
                still make it with whole episodes.
              </p>
              <button className="btn btn--sm" style={{ marginTop: 12 }} onClick={() => find(null, "full")}>
                Use whole episodes
              </button>
            </div>
          )}

          <ul>
            {result.items.map((x) => {
              const on = picked.includes(x.episodeId);
              const clips = result.mode === "clips" ? x.clips || [] : [];
              const partial = clips.length > 0 && !clips[0].whole;
              return (
                <li key={x.episodeId}>
                  <button type="button" className={`pick ${on ? "is-on" : ""}`} onClick={() => toggle(x.episodeId)} aria-pressed={on}>
                    <span className="pick__box" aria-hidden="true">{on ? "✓" : ""}</span>
                    <Art src={x.image} title={x.show} size={56} radius={12} />
                    <span className="min0 grow">
                      <span className="pick__show">{x.show}</span>
                      <span className="pick__title">{x.episode}</span>
                      <span className="pick__meta mono">
                        {partial
                          ? `${clips.length} ${clips.length === 1 ? "clip" : "clips"} · ${clock(clipSeconds(clips))}`
                          : [shortDate(x.date), minutes(x.duration), result.mode === "clips" ? "plays in full" : null].filter(Boolean).join(" · ")}
                      </span>
                      {partial && clips[0].quote && <span className="pick__quote">“…{clips[0].quote}…”</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {result && chosen.length > 0 && (
        <section className="card stack" style={{ marginTop: 26 }}>
          <p className="mono">
            {chosen.length} episodes · {result.mode === "clips" ? clock(total) : minutes(total)} total
          </p>
          <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
          <textarea
            className="input textarea"
            rows={3}
            placeholder="One or two lines: why this, why now? (optional)"
            value={dek}
            onChange={(e) => setDek(e.target.value)}
            maxLength={300}
          />
          <div className="row gap center">
            <span className="small" style={{ fontWeight: 700 }}>Color</span>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch tone-${c} ${color === c ? "is-on" : ""}`}
                onClick={() => setColor(c)}
                aria-label={c}
                aria-pressed={color === c}
              />
            ))}
          </div>
          <button className="btn btn--big btn--display btn--cobalt" style={{ marginTop: 10 }} onClick={publish} disabled={saving || !state?.accounts}>
            {saving ? "Publishing…" : state?.user ? "Publish brief" : "Sign in to publish"}
          </button>
          {state && !state.accounts && <p className="muted small">Publishing needs profiles switched on (Supabase keys in Vercel).</p>}
        </section>
      )}
    </>
  );
}
