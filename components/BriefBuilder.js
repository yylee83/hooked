"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Art from "./Art";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { refreshCatalog } from "@/lib/catalog-client";
import { briefSeconds, clipSeconds, clock } from "@/lib/clips";
import { minutes, shortDate } from "@/lib/format";
import { MAX_ITEMS, UNTITLED, savedItem } from "@/lib/briefs-client";

const DRAFT = "hooked:brief-draft";
const COLORS = ["cobalt", "bubblegum", "butter"];

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
// One key per episode: the Podcast Index number when it has one (so the same episode found by search
// and by a pasted link match), otherwise our own id (shows read from their own feed).
const itemKey = (x) => (x.episodeId != null ? `p${x.episodeId}` : x.episodeRef ? `r${x.episodeRef}` : `t${x.episode}`);
// Drafts saved before this change kept bare Podcast Index numbers.
const asKey = (k) => (/^\d+$/.test(String(k)) ? `p${k}` : String(k));

// A saved brief, as the builder edits it.
export const editingFrom = (b) => ({
  id: b.id,
  authorId: b.author_id,
  draft: !!b.draft,
  title: b.title,
  dek: b.dek,
  color: b.color,
  mode: b.mode,
  topic: b.topic,
  items: b.items || [],
});

export default function BriefBuilder({ initialTopic = "", editing = null }) {
  const router = useRouter();
  const state = useStore();
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState("clips");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // The latest search, shown as the list to pick from: { topic, mode, items }.
  const [result, setResult] = useState(null);
  // What's in the brief: the order (keys) and each episode's details. Kept separately from the
  // search, so your picks stay when you search again. Nothing is picked for you.
  const [picked, setPicked] = useState([]);
  const [pool, setPool] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState("");
  // The title follows the topic until you type your own.
  const [titleTouched, setTitleTouched] = useState(false);
  const [dek, setDek] = useState("");
  const [color, setColor] = useState("cobalt");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Signed in, a new brief (or a draft) is saved to your account as you go, as a draft only you can see.
  // A published brief you're editing changes only when you tap "Save changes".
  const [draftId, setDraftId] = useState(editing?.draft ? editing.id : null);
  const [draftSaved, setDraftSaved] = useState(""); // "saving" / "saved" / "failed"
  const autosaving = useRef(null);

  // Bring back a draft (e.g. after signing in to publish), or start from a trending topic.
  useEffect(() => {
    if (editing) {
      const items = editing.items || [];
      setTopic(editing.topic || "");
      setMode(editing.mode || "clips");
      setResult({ topic: editing.topic, mode: editing.mode || "clips", items });
      setPicked(items.map(itemKey));
      setPool(Object.fromEntries(items.map((x) => [itemKey(x), x])));
      // A draft started from an episode page has no title yet: let it follow the topic.
      const untitled = editing.draft && editing.title === UNTITLED;
      setTitle(untitled ? "" : editing.title || "");
      setTitleTouched(!untitled);
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
        setPicked((d.picked || []).map(asKey));
        // Drafts saved before picks were kept separately: their details are in the search results.
        setPool(d.pool || Object.fromEntries((d.result?.items || []).map((x) => [itemKey(x), x])));
        setTitle(d.title);
        setTitleTouched(d.titleTouched ?? !!d.title);
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
    try {
      const res = await fetch(`/api/briefs/draft?${new URLSearchParams({ topic: t, mode: m })}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      // The list shows only this search. Your picks stay in the brief.
      setResult(data);
      setShowAll(false);
      if (!titleTouched) setTitle(titleCase(t));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // The brief plays in the order you picked (and can reorder).
  const chosen = useMemo(() => picked.map((k) => pool[k]).filter(Boolean), [picked, pool]);
  const briefMode = result?.mode || mode;
  const briefTopic = result?.topic || topic.trim() || chosen[0]?.show || "";

  function move(key, dir) {
    setPicked((p) => {
      const i = p.indexOf(key);
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
    const { error: err } = await supabase().from("briefs").delete().eq("id", autosaving.current?.id || draftId || editing.id);
    if (err) {
      setSaving(false);
      setError("Couldn't delete. Try again.");
      return;
    }
    router.push(isDraft ? "/me" : "/briefs");
    router.refresh();
  }
  const isDraft = !!draftId || !!editing?.draft;
  const isPublished = !!editing && !editing.draft;
  const total = briefSeconds(chosen, briefMode);
  const clipCount = result?.mode === "clips" ? result.items.filter((x) => x.clips?.length).length : 0;

  // Tick or untick an episode (up to 12 in a brief).
  function toggle(item) {
    const k = itemKey(item);
    if (picked.includes(k)) return setPicked((p) => p.filter((x) => x !== k));
    if (picked.length >= MAX_ITEMS) return;
    setPool((o) => ({ ...o, [k]: item }));
    setPicked((p) => [...p, k]);
  }

  // Add one episode by pasting its Apple Podcasts or Spotify link. It goes straight into the brief.
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
      const t = (result?.topic || topic).trim();
      const res = await fetch(`/api/briefs/add?${new URLSearchParams({ url, topic: t, mode: briefMode })}`);
      const data = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error || "We couldn't find that episode.");
      const item = data.item;
      const k = itemKey(item);
      if (!picked.includes(k) && picked.length >= MAX_ITEMS) throw new Error(`A brief can hold ${MAX_ITEMS} episodes. Remove one first.`);
      setPool((o) => ({ ...o, [k]: item }));
      setPicked((p) => (p.includes(k) ? p : [...p, k]));
      setLink("");
      setLinkMsg(`Added “${item.episode}”.`);
    } catch (err) {
      setLinkMsg(err.message);
    }
    setAdding(false);
  }

  // The brief as it's saved. Our ids go with each item; the database fills them in from Podcast Index numbers.
  function briefRow() {
    const items = chosen.map((x) => savedItem(x, briefMode));
    return {
      title: title.trim().slice(0, 80) || (briefTopic ? titleCase(briefTopic).slice(0, 80) : UNTITLED),
      dek: dek.trim() || null,
      topic: briefTopic,
      color,
      mode: briefMode,
      items,
      total_seconds: Math.round(briefSeconds(items, briefMode)),
    };
  }

  // Save the draft a moment after each change. Never while publishing, and never for a published brief.
  const canDraft = !!state?.user && !(editing && !editing.draft) && chosen.length > 0;
  const draftKey = canDraft ? JSON.stringify({ ...briefRow(), title: title.trim().slice(0, 80) || UNTITLED }) : "";
  // One save at a time (so a new draft is only created once). Resolves true once saved.
  function writeDraft(key, how = "saved") {
    const job = (autosaving.current ||= {});
    clearTimeout(job.timer);
    const before = job.running;
    job.running = (async () => {
      await before;
      setDraftSaved("saving");
      const row = { ...JSON.parse(key), draft: true };
      const id = job.id || draftId;
      const q = id ? supabase().from("briefs").update(row).eq("id", id) : supabase().from("briefs").insert(row);
      const { data, error: err } = await q.select("id").single();
      if (err) {
        setDraftSaved("failed");
        return false;
      }
      if (!id) {
        job.id = data.id;
        setDraftId(data.id);
        // Reloading (or coming back later) opens this draft.
        window.history.replaceState(null, "", `/briefs/b/${data.id}/edit`);
        try {
          sessionStorage.removeItem(DRAFT);
        } catch {}
      }
      setDraftSaved(how);
      return true;
    })();
    return job.running;
  }
  useEffect(() => {
    if (!draftKey || saving) return;
    const job = (autosaving.current ||= {});
    clearTimeout(job.timer);
    job.timer = setTimeout(() => writeDraft(draftKey), 1200);
    return () => clearTimeout(job.timer);
  }, [draftKey, saving]); // eslint-disable-line react-hooks/exhaustive-deps

  async function publish() {
    if (!state?.user) {
      try {
        sessionStorage.setItem(DRAFT, JSON.stringify({ topic, mode, result, picked, pool, title, titleTouched, dek, color }));
      } catch {}
      router.push("/login?next=/briefs/new");
      return;
    }
    setSaving(true);
    setError("");
    clearTimeout(autosaving.current?.timer);
    await autosaving.current?.running;
    const row = briefRow();
    // Publishing a draft turns it public. (Only drafts send `draft`, so publishing works before that column exists.)
    const draft = autosaving.current?.id || draftId;
    const id = draft || editing?.id;
    const q = id ? supabase().from("briefs").update(draft ? { ...row, draft: false } : row).eq("id", id) : supabase().from("briefs").insert(row);
    const { data, error: err } = await q.select("id").single();
    if (err) {
      setSaving(false);
      setError(state.profile?.handle ? `Couldn't publish (${err.message}). Try again in a moment.` : "Pick a handle on My log first, then publish.");
      return;
    }
    for (const it of row.items) if (it.episodeId != null) refreshCatalog({ episodeId: it.episodeId });
    try {
      sessionStorage.removeItem(DRAFT);
    } catch {}
    router.push(`/briefs/b/${data.id}`);
    router.refresh();
  }

  const LIMIT = 8;
  const shown = result ? (showAll ? result.items : result.items.slice(0, LIMIT)) : [];
  const scrollToBrief = () => document.getElementById("your-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <Link href={isPublished ? `/briefs/b/${editing.id}` : "/briefs"} className="back">
        ← {isPublished ? "Back to brief" : "Briefs"}
      </Link>
      <h1 className="display h-lg" style={{ margin: "18px 0 8px" }}>
        {isPublished ? "Edit brief" : editing?.draft ? "Your draft" : "New brief"}
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
            {shown.map((x) => {
              const on = picked.includes(itemKey(x));
              const clips = result.mode === "clips" ? x.clips || [] : [];
              const partial = clips.length > 0 && !clips[0].whole;
              return (
                <li key={itemKey(x)}>
                  <button type="button" className={`pick ${on ? "is-on" : ""}`} onClick={() => toggle(x)} aria-pressed={on}>
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
          {result.items.length > shown.length && (
            <button type="button" className="btn btn--sm brief-more" onClick={() => setShowAll(true)}>
              Show {result.items.length - shown.length} more
            </button>
          )}

          {/* Stays in view while you scroll the results, then settles just above your brief. */}
          {chosen.length > 0 && (
            <div className="briefbar" role="status">
              <span className="briefbar__text">
                <span className="mono briefbar__label">Your brief</span>
                <span className="briefbar__sum">
                  {chosen.length} {chosen.length === 1 ? "episode" : "episodes"} · {briefMode === "clips" ? clock(total) : minutes(total)}
                </span>
              </span>
              <button type="button" className="btn btn--sm btn--butter" onClick={scrollToBrief}>
                Review ↓
              </button>
            </div>
          )}
        </section>
      )}

      {chosen.length > 0 && (
        <section id="your-brief" className="card stack" style={{ marginTop: 26, scrollMarginTop: 20 }}>
          <h2 className="label" style={{ margin: 0 }}>Your brief</h2>
          {isDraft && (
            <p className="mono small muted" style={{ margin: 0 }} role="status">
              {draftSaved === "failed" ? "Couldn't save the draft just now." : "Draft · saved as you go · only you can see it"}
            </p>
          )}
          <p className="mono">
            {chosen.length} {chosen.length === 1 ? "episode" : "episodes"} · {briefMode === "clips" ? clock(total) : minutes(total)} total
          </p>
          <ol className="order">
            {chosen.map((x, i) => (
              <li key={itemKey(x)} className="order__row">
                <span className="mono order__n">{i + 1}</span>
                <Art src={x.image} title={x.show} size={40} radius={9} />
                <span className="min0 grow order__title">{x.episode}</span>
                <span className="order__btns">
                  <button type="button" onClick={() => move(itemKey(x), -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button type="button" onClick={() => move(itemKey(x), 1)} disabled={i === chosen.length - 1} aria-label="Move down">↓</button>
                  <button type="button" onClick={() => toggle(x)} aria-label="Remove from brief">✕</button>
                </span>
              </li>
            ))}
          </ol>
          <input
            className="input"
            placeholder="Title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            maxLength={80}
          />
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
            {saving ? (isPublished ? "Saving…" : "Publishing…") : !state?.user ? "Sign in to publish" : isPublished ? "Save changes" : "Publish brief"}
          </button>
          <div className="row gap center wrap" style={{ justifyContent: "center" }}>
            {canDraft && (
              <button type="button" className="btn btn--sm" onClick={() => writeDraft(draftKey, "kept")} disabled={saving || draftSaved === "saving"}>
                {draftSaved === "saving" ? "Saving…" : "Save draft"}
              </button>
            )}
            {(editing || draftId) && (
              <button type="button" className={`btn btn--sm ${confirmDelete ? "btn--ink" : ""}`} onClick={remove} disabled={saving}>
                {confirmDelete ? "Tap again to delete for good" : isDraft ? "Delete this draft" : "Delete this brief"}
              </button>
            )}
          </div>
          {draftSaved === "kept" && (
            <p className="small" style={{ margin: 0, textAlign: "center" }} role="status">
              ✓ Draft saved. It&apos;s under My briefs on{" "}
              <Link href="/me" className="u-link">
                My log
              </Link>
              , ready when you are.
            </p>
          )}
          {state && !state.accounts && <p className="muted small">Publishing needs profiles switched on (Supabase keys in Vercel).</p>}
        </section>
      )}
    </>
  );
}
