"use client";
import BackButton from "./BackButton";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Art from "./Art";
import BriefOrder from "./BriefOrder";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { refreshCatalog } from "@/lib/catalog-client";
import { briefSeconds, clipSeconds, clock } from "@/lib/clips";
import { minutes, shortDate } from "@/lib/format";
import { MAX_ITEMS, UNTITLED, savedItem, withOurIds } from "@/lib/briefs-client";
import { cleanWordsMessage } from "@/lib/clean-words";

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
  // New briefs use whole episodes for now (Erin, 2026-11-18); "Just the parts" comes back as a choice later.
  // Briefs already made with clips keep their mode when edited.
  const [mode, setMode] = useState("full");
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
  const [wordNote, setWordNote] = useState(""); // "Please edit out …" when the title or description has a banned word
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

  // Move the episode at position `from` to position `to` (by drag, or one step with the arrows).
  function move(from, to) {
    const key = chosen[from] && itemKey(chosen[from]);
    const target = chosen[to] && itemKey(chosen[to]);
    if (!key || !target || key === target) return;
    setPicked((p) => {
      const i = p.indexOf(key);
      const j = p.indexOf(target);
      if (i < 0 || j < 0) return p;
      const next = [...p];
      next.splice(i, 1);
      next.splice(j, 0, key);
      return next;
    });
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setSaving(true);
    const { data, error: err } = await supabase()
      .from("briefs")
      .delete()
      .eq("id", autosaving.current?.id || draftId || editing.id)
      .select("id");
    if (err || !data?.length) {
      setSaving(false);
      setConfirmDelete(false);
      setError("Couldn't delete. Try again.");
      return;
    }
    router.push(isDraft ? "/me" : "/lists");
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
      if (!picked.includes(k) && picked.length >= MAX_ITEMS) throw new Error(`A list can hold ${MAX_ITEMS} episodes. Remove one first.`);
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
      setWordNote(cleanWordsMessage(err) || "");
      if (err) {
        setDraftSaved("failed");
        return false;
      }
      if (!id) {
        job.id = data.id;
        setDraftId(data.id);
        // Reloading (or coming back later) opens this draft.
        window.history.replaceState(null, "", `/lists/b/${data.id}/edit`);
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
      router.push("/login?next=/lists/new");
      return;
    }
    setSaving(true);
    setError("");
    clearTimeout(autosaving.current?.timer);
    await autosaving.current?.running;
    const base = briefRow();
    const row = { ...base, items: await withOurIds(base.items) };
    // Publishing a draft turns it public. (Only drafts send `draft`, so publishing works before that column exists.)
    const draft = autosaving.current?.id || draftId;
    const id = draft || editing?.id;
    const q = id ? supabase().from("briefs").update(draft ? { ...row, draft: false } : row).eq("id", id) : supabase().from("briefs").insert(row);
    const { data, error: err } = await q.select("id").single();
    setWordNote(cleanWordsMessage(err) || "");
    if (err) {
      setSaving(false);
      if (cleanWordsMessage(err)) return;
      setError(state.profile?.handle ? `Couldn't publish (${err.message}). Try again in a moment.` : "Pick a handle on My log first, then publish.");
      return;
    }
    for (const it of row.items) if (it.episodeId != null) refreshCatalog({ episodeId: it.episodeId });
    try {
      sessionStorage.removeItem(DRAFT);
    } catch {}
    router.push(`/lists/b/${data.id}`);
    router.refresh();
  }

  const LIMIT = 8;
  const shown = result ? (showAll ? result.items : result.items.slice(0, LIMIT)) : [];
  const scrollToBrief = () => document.getElementById("your-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <BackButton fallback={isPublished ? `/lists/b/${editing.id}` : "/lists"} />
      <h1 className="display h-lg" style={{ margin: "18px 0 8px" }}>
        {isPublished ? "Edit list" : editing?.draft ? "Your draft" : "New list"}
      </h1>
      <p className="muted" style={{ fontSize: 19 }}>
        Pick a topic. We'll find episodes about it, and you choose the ones that make your list.
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
                <span className="mono briefbar__label">Your list</span>
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
          <h2 className="label" style={{ margin: 0 }}>Your list</h2>
          {isDraft && (
            <p className="mono small muted" style={{ margin: 0 }} role="status">
              {draftSaved === "failed" ? "Couldn't save the draft just now." : "Draft · saved as you go · only you can see it"}
            </p>
          )}
          <p className="mono">
            {chosen.length} {chosen.length === 1 ? "episode" : "episodes"} · {briefMode === "clips" ? clock(total) : minutes(total)} total
          </p>
          <BriefOrder items={chosen} keyOf={itemKey} onMove={move} onRemove={toggle} />
          <input
            className="input"
            placeholder="Title"
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
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
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
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
          {wordNote && <p className="nudge small" role="alert">{wordNote}</p>}
          <button className="btn btn--big btn--display btn--cobalt" style={{ marginTop: 10 }} onClick={publish} disabled={saving || !state?.accounts}>
            {saving ? (isPublished ? "Saving…" : "Publishing…") : !state?.user ? "Sign in to publish" : isPublished ? "Save changes" : "Publish list"}
          </button>
          <div className="row gap center wrap" style={{ justifyContent: "center" }}>
            {canDraft && (
              <button type="button" className="btn btn--sm" onClick={() => writeDraft(draftKey, "kept")} disabled={saving || draftSaved === "saving"}>
                {draftSaved === "saving" ? "Saving…" : "Save draft"}
              </button>
            )}
            {(editing || draftId) && (
              <button type="button" className={`btn btn--sm ${confirmDelete ? "btn--ink" : ""}`} onClick={remove} disabled={saving}>
                {confirmDelete ? "Tap again to delete for good" : isDraft ? "Delete this draft" : "Delete this list"}
              </button>
            )}
          </div>
          {draftSaved === "kept" && (
            <p className="small" style={{ margin: 0, textAlign: "center" }} role="status">
              ✓ Draft saved. It&apos;s under My lists on{" "}
              <Link href="/me" className="u-link">
                My log
              </Link>
              , ready when you are.
            </p>
          )}
          {state && !state.accounts && <p className="muted small">Publishing needs profiles switched on (Supabase keys in Vercel).</p>}
        </section>
      )}

      {/* With every episode taken out, the card above is gone: deleting still works. */}
      {chosen.length === 0 && (editing || draftId) && (
        <div className="row gap center" style={{ justifyContent: "center", marginTop: 26 }}>
          <button type="button" className={`btn btn--sm ${confirmDelete ? "btn--ink" : ""}`} onClick={remove} disabled={saving}>
            {confirmDelete ? "Tap again to delete for good" : isDraft ? "Delete this draft" : "Delete this list"}
          </button>
        </div>
      )}
    </>
  );
}
