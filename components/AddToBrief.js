"use client";
// "+ List" on an episode page: add the episode to one of your briefs (drafts first), or start a new draft with it.
// Adding to a published brief changes it for everyone right away, so the sheet says so.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { MAX_ITEMS, addToBrief, inBrief, myBriefs, startDraft } from "@/lib/briefs-client";

export function AddToBriefButton({ episode }) {
  const state = useStore();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (!state?.accounts) return null;
  if (!state.user)
    return (
      <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn btn--sm">
        + List
      </Link>
    );
  return (
    <>
      <button className="btn btn--sm" onClick={() => setOpen(true)} title="Add to a list">
        + List
      </button>
      {open && <AddToBriefSheet episode={episode} userId={state.user.id} onClose={() => setOpen(false)} />}
    </>
  );
}

const briefHref = (b) => (b.draft ? `/lists/b/${b.id}/edit` : `/lists/b/${b.id}`);

function AddToBriefSheet({ episode, userId, onClose }) {
  const [briefs, setBriefs] = useState(null);
  const [busy, setBusy] = useState(""); // the brief id being added to, or "new"
  const [done, setDone] = useState(null); // the brief it was just added to
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    let live = true;
    myBriefs(userId).then(
      (b) => live && setBriefs(b),
      () => live && (setBriefs([]), setError("Couldn't load your lists. Try again."))
    );
    return () => {
      live = false;
    };
  }, [userId]);

  async function run(id, fn) {
    setBusy(id);
    setError("");
    try {
      const b = await fn();
      setBriefs((all) => [b, ...(all || []).filter((x) => x.id !== b.id)].sort((x, y) => !!y.draft - !!x.draft));
      setDone(b);
    } catch (e) {
      setError(e?.message || "Couldn't add it. Try again.");
    }
    setBusy("");
  }

  return (
    <div className="plus-sheet add-brief" role="dialog" aria-modal="true" aria-label="Add to a list" onClick={onClose}>
      <div className="plus-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="row center" style={{ justifyContent: "space-between" }}>
          <p className="display plus-sheet__title" style={{ margin: 0 }}>Add to a list</p>
          <button className="mini__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="add-brief__ep">{episode.title}</p>

        {done && (
          <p className="add-brief__done" role="status">
            ✓ Added to <b>{done.title}</b>.{" "}
            {!done.draft && "It's published, so others will see it now. "}
            <Link href={briefHref(done)} className="u-link" onClick={onClose}>
              {done.draft ? "Open the draft ›" : "Open it ›"}
            </Link>
          </p>
        )}
        {error && <p className="add-brief__error">{error}</p>}

        {briefs === null ? (
          <p className="muted">Loading your lists…</p>
        ) : (
          <ul className="add-brief__list">
            {briefs.map((b) => {
              const has = inBrief(b, episode);
              const full = !has && (b.items || []).length >= MAX_ITEMS;
              const n = (b.items || []).length;
              return (
                <li key={b.id}>
                  <button
                    className={`add-brief__row ${has ? "is-in" : ""}`}
                    disabled={has || full || !!busy}
                    onClick={() => run(b.id, () => addToBrief(b, episode))}
                  >
                    <span className={`add-brief__dot tone-${b.color}`} aria-hidden="true" />
                    <span className="min0 grow">
                      <span className="add-brief__title">{b.title}</span>
                      <span className="add-brief__meta mono">
                        {b.draft ? "Draft" : "Published"} · {n} {n === 1 ? "episode" : "episodes"}
                        {full ? " · full" : ""}
                      </span>
                    </span>
                    <span className="add-brief__state">{busy === b.id ? "Adding…" : has ? "✓ In it" : "Add"}</span>
                  </button>
                </li>
              );
            })}
            <li>
              <button className="add-brief__row add-brief__new" disabled={!!busy} onClick={() => run("new", () => startDraft(episode))}>
                <span className="add-brief__plus" aria-hidden="true">＋</span>
                <span className="grow">{busy === "new" ? "Starting a draft…" : "Start a new list with this episode"}</span>
              </button>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
