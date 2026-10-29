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

export default function BriefBuilder({ initialTopic = "", editing = null }) {
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Bring back a draft (e.g. after signing in to publish), or start from a trending topic.
  useEffect(() => {
    if (editing) {
      setTopic(editing.topic || "");
      setMode(editing.mode || "clips");
      setResult({ topic: editing.topic, mode: editing.mode || "clips", items: editing.items || [] });
      setPicked((editing.items || []).map((x) => x.episodeId));
      setTitle(editing.title || "");
      setDek(editing.dek || "");
      setColor(editing.color || "cobalt");
      return;
    }
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
    // Keep episodes you've already chosen (from an earlier search or a pasted link).
    const keep = result ? result.items.filter((x) => picked.includes(x.episodeId)) : [];
    if (!editing && !keep.length) setResult(null);
    try {
      const res = await fetch(`/api/briefs/draft?${new URLSearchParams({ topic: t, mode: m })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (editing) {
        // Keep what's already in the brief, and add the new finds below it.
        const have = new Set(keep.map((x) => String(x.episodeId)));
        setResult({ ...data, items: [...keep, ...data.items.filter((x) => !have.has(String(x.episodeId)))] });
        return;
      }
      const have = new Set(keep.map((x) => String(x.episodeId)));
      const fresh = data.items.filter((x) => !have.has(String(x.episodeId)));
      setResult({ ...data, items: [...keep, ...fresh] });
      const withClips = fresh.filter((x) => x.clips?.length);
      const first = (m === "clips" && withClips.length ? withClips : fresh).slice(0, Math.max(0, (m === "clips" ? 5 : 4) - keep.length));
      setPicked([...keep.map((x) => x.episodeId), ...first.map((x) => x.episodeId)]);
      if (!title) setTitle(titleCase(t));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // The brief plays in the order you picked (and can reorder).
  const chosen = useMemo(() => {
    if (!result) return [];
    const byId = new Map(result.items.map((x) => [String(x.episodeId), x]));
    return picked.map((id) => byId.get(String(id))).filter(Boolean);
  }, [result, picked]);

  function move(id, dir) {
    setPicked((p) => {
      const i = p.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    const { error: err } = await supabase().from("briefs").delete().eq("id", editing.id);
    if (err) {
      setSaving(false);
      setError("Couldn't delete. Try again.");
      return;
    }
    router.push("/briefs");
    router.refresh();
  }
  const total = briefSeconds(chosen, result?.mode);
  const clipCount = result?.mode === "clips" ? result.items.filter((x) => x.clips?.length).length : 0;

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 12 ? p : [...p, id]));
  }

  // Add one episode by pasting its Apple Podcasts or Spotify link.
  const [link, setLink] = useState("");
  const [adding, setAdding] = useState(false);
  const [linkMsg, setLinkMsg] = useState("");
  async function addLink(e, value) {
    e?.preventDefault();
    const url = (value ?? link).trim();
    if (!url) return;
    setAdding(true);
    setLinkMsg("");
    try {
      const m = result?.mode || mode;
      const t = (result?.topic || topic).trim();
      const res = await fetch(`/api/briefs/add?${new URLSearchParams({ url, topic: t, mode: m })}`);
      const data = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error || "We couldn't find that episode.");
      const item = data.item;
      setResult((r) => {
        const base = r || { topic: t || item.show, mode: m, items: [] };
        const rest = base.items.filter((x) => String(x.episodeId) !== String(item.episodeId));
        return { ...base, items: [item, ...rest] };
      });
      setPicked((p) => (p.includes(item.episodeId) ? p : p.length >= 12 ? p : [...p, item.episodeId]));
      setLink("");
      setLinkMsg(`Added “${item.episode}”.`);
    } catch (err) {
      setLinkMsg(err.message);
    }
    setAdding(false);
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
    const row = {
      title: title.trim().slice(0, 80) || titleCase(result.topic),
      dek: dek.trim() || null,
      topic: result.topic,
      color,
      mode: result.mode,
      items,
      total_seconds: Math.round(briefSeconds(items, result.mode)),
    };
    const q = editing ? supabase().from("briefs").update(row).eq("id", editing.id) : supabase().from("briefs").insert(row);
    const { data, error: err } = await q.select("id").single();
    if (err) {
      setSaving(false);
      setError(state.profile?.handle ? `Couldn't publish (${err.message}). Try again in a moment.` : "Pick a handle on My log first, then publish.");
      return;
    }
    try {
      sessionStorage.removeItem(DRAFT);
    } catch {}
    router.push(`/briefs/b/${data.id}`);
    router.refresh();
  }

  return (
    <>
      <Link href={editing ? `/briefs/b/${editing.id}` : "/briefs"} className="back">
        ← {editing ? "Back to brief" : "Briefs"}
      </Link>
      <h1 className="display h-lg" style={{ margin: "18px 0 8px" }}>
        {editing ? "Edit brief" : "New brief"}
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

      <form className="paste" onSubmit={addLink} style={{ marginTop: 18 }}>
        <label className="mono small paste__label" htmlFor="brief-link">
          Have a specific episode? Paste its Apple Podcasts or Spotify link
        </label>
        <div className="paste__row">
          <input
            id="brief-link"
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://open.spotify.com/episode/…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onPaste={(e) => {
              const t = e.clipboardData.getData("text").trim();
              if (!t) return;
              e.preventDefault();
              setLink(t);
              addLink(null, t);
            }}
          />
          <button className="btn btn--cobalt" disabled={adding || !link.trim()}>
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {linkMsg && <p className="paste__msg">{linkMsg}</p>}
      </form>

      {error && <p className="nudge" style={{ marginTop: 14 }}>{error}</p>}

      {result && (
        <section>
          <h2 className="label">
            {result.items.length
              ? `${result.items.length} ${result.items.length === 1 ? "episode" : "episodes"}${result.topic ? ` · “${result.topic}”` : ""}`
              : `Nothing found for “${result.topic}”`}
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
          <ol className="order">
            {chosen.map((x, i) => (
              <li key={x.episodeId} className="order__row">
                <span className="mono order__n">{i + 1}</span>
                <Art src={x.image} title={x.show} size={40} radius={9} />
                <span className="min0 grow order__title">{x.episode}</span>
                <span className="order__btns">
                  <button type="button" onClick={() => move(x.episodeId, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" onClick={() => move(x.episodeId, 1)} disabled={i === chosen.length - 1} aria-label="Move down">↓</button>
                  <button type="button" onClick={() => toggle(x.episodeId)} aria-label="Remove from brief">✕</button>
                </span>
              </li>
            ))}
          </ol>
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
            {saving ? (editing ? "Saving…" : "Publishing…") : !state?.user ? "Sign in to publish" : editing ? "Save changes" : "Publish brief"}
          </button>
          {editing && (
            <button type="button" className={`btn ${confirmDelete ? "btn--ink" : ""}`} onClick={remove} disabled={saving} style={{ alignSelf: "center" }}>
              {confirmDelete ? "Tap again to delete for good" : "Delete this brief"}
            </button>
          )}
          {state && !state.accounts && <p className="muted small">Publishing needs profiles switched on (Supabase keys in Vercel).</p>}
        </section>
      )}
    </>
  );
}
