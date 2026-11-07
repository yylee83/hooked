"use client";
// Reactions and replies under one person's log of one episode.
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addToList, inUpNext, useStore } from "@/lib/store";
import { REACTIONS, deleteComment, postComment, timeAgo, toggleReaction, useThread } from "@/lib/social";

// Small black icons for the reactions. Yours are filled in (and + turns into a check).
const THUMB = "M7 10.5V21H3.5V10.5z M7 10.5l4.2-7.3c1.6 0 2.8 1.3 2.6 2.9L13.3 9.5h5.4a2 2 0 0 1 2 2.4l-1.5 7.3A2.2 2.2 0 0 1 17 21H7";
function Icon({ kind, on }) {
  const common = { viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": true, strokeLinejoin: "round", strokeLinecap: "round" };
  if (kind === "adding") {
    return on ? (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.8">
        <path d="M4.5 12.5l5 5L19.5 7" />
      </svg>
    ) : (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M12 4.5v15M4.5 12h15" />
      </svg>
    );
  }
  return (
    <svg {...common} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" style={kind === "disagree" ? { transform: "rotate(180deg)" } : undefined}>
      <path d={THUMB} />
    </svg>
  );
}

// episodeRef is our episode id (the thread's key); episodeId is the Podcast Index number, when there is one.
export default function LogThread({ logUserId, episodeRef, episodeId, defaultOpen = false, id }) {
  const state = useStore();
  const ep = { ref: episodeRef, id: episodeId ?? undefined };
  const data = useThread(logUserId, episodeRef);
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tip, setTip] = useState(null); // reaction name shown while pressing and holding
  const holdTimer = useRef(null);
  const held = useRef(false); // a press-and-hold shows the name; it shouldn't also count as a tap

  if (!logUserId || !episodeRef || (state && !state.accounts)) return null;

  const me = state?.user || null;
  const reactions = data?.reactions || [];
  const comments = data?.comments || [];
  const counts = Object.fromEntries(REACTIONS.map((r) => [r.kind, reactions.filter((x) => x.kind === r.kind).length]));
  const mine = new Set(reactions.filter((x) => x.user_id === me?.id).map((x) => x.kind));
  const isOwner = me?.id === logUserId;
  // Thumbs up and down vote on the review. "+" (add the episode to Up next) is ReviewAdd, next to the episode.
  const votes = REACTIONS.filter((r) => r.kind !== "adding");
  // Everyone else sees both; on your own review, only the ones people used.
  const shown = isOwner ? votes.filter((r) => counts[r.kind] > 0) : votes;
  const hold = (kind) => {
    clearTimeout(holdTimer.current);
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setTip(kind);
    }, 400);
  };
  const release = () => {
    clearTimeout(holdTimer.current);
    setTimeout(() => setTip(null), 900);
  };
  const signInHref = `/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/")}`;

  async function react(kind) {
    setError("");
    if (!me) return setError("signin");
    try {
      await toggleReaction(me, logUserId, ep, kind);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await postComment(me, state.profile, logUserId, ep, text);
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="thread" id={id}>
      <div className="thread__bar">
        {shown.map((r) => (
          <span key={r.kind} className="react-wrap">
            <button
              className={`react-i ${mine.has(r.kind) ? "is-mine" : ""}`}
              onClick={() => {
                if (held.current) return void (held.current = false);
                me ? react(r.kind) : setError("signin");
              }}
              onPointerDown={() => hold(r.kind)}
              onPointerUp={release}
              onPointerLeave={release}
              onContextMenu={(e) => e.preventDefault()}
              aria-pressed={mine.has(r.kind)}
              aria-label={r.label}
              title={r.label}
              disabled={isOwner}
            >
              <Icon kind={r.kind} on={mine.has(r.kind)} />
              {counts[r.kind] > 0 && <span className="react__n">{counts[r.kind]}</span>}
            </button>
            {tip === r.kind && <span className="react-tip" role="tooltip">{r.label}</span>}
          </span>
        ))}
        <button className="thread__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round">
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          {comments.length ? `${comments.length} ${comments.length === 1 ? "reply" : "replies"}` : "Reply"}
        </button>
      </div>

      {error === "signin" ? (
        <p className="small muted thread__note">
          <Link href={signInHref} className="u-link">
            Sign in
          </Link>{" "}
          to react and reply.
        </p>
      ) : (
        error && <p className="nudge small thread__note">{error}</p>
      )}

      {open && (
        <div className="thread__body">
          {comments.length > 0 && (
            <ul className="thread__list">
              {comments.map((c) => (
                <li key={c.id} className="comment">
                  <p className="comment__meta">
                    <Link href={`/u/${c.author?.handle || ""}`} className="comment__who">
                      @{c.author?.handle || "someone"}
                    </Link>
                    {c.author_id === logUserId && <span className="comment__op">author</span>}
                    <span className="muted"> · {timeAgo(c.created_at)}</span>
                    {(me?.id === c.author_id || isOwner) && (
                      <button className="comment__del" onClick={() => deleteComment(c)} aria-label="Delete reply">
                        Delete
                      </button>
                    )}
                  </p>
                  <p className="comment__body">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
          {me ? (
            <form className="thread__form" onSubmit={submit}>
              <input
                className="input"
                placeholder={isOwner ? "Reply to the conversation…" : "Agree? Disagree? Say so…"}
                value={text}
                maxLength={500}
                onChange={(e) => setText(e.target.value)}
                aria-label="Write a reply"
              />
              <button className="btn btn--sm btn--cobalt" disabled={busy || !text.trim()}>
                {busy ? "…" : "Post"}
              </button>
            </form>
          ) : (
            <p className="small muted">
              <Link href={signInHref} className="u-link">
                Sign in
              </Link>{" "}
              to join the conversation.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// "+" next to an episode in a list of reviews: adds the episode to your Up next, and counts as this review getting
// you to listen (the "adding" reaction). Not shown on episode pages, which have their own "+ Up next" button.
export function ReviewAdd({ logUserId, episodeRef, episodeId }) {
  const state = useStore();
  const router = useRouter();
  const data = useThread(logUserId, episodeRef);
  const [added, setAdded] = useState(false); // "Added to queue" for a few seconds after tapping
  const timer = useRef(null);
  if (!logUserId || !episodeRef || (state && !state.accounts)) return null;

  const me = state?.user || null;
  const ep = { ref: episodeRef, id: episodeId ?? undefined };
  const adds = (data?.reactions || []).filter((x) => x.kind === "adding");
  const on = adds.some((x) => x.user_id === me?.id);
  const isOwner = me?.id === logUserId;
  // On your own review, only the count, once someone has used it.
  if (isOwner && !adds.length) return null;

  async function tap() {
    if (!me) return router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    clearTimeout(timer.current);
    setAdded(!on);
    if (!on) timer.current = setTimeout(() => setAdded(false), 3500);
    try {
      const nowOn = await toggleReaction(me, logUserId, ep, "adding");
      if (nowOn && !inUpNext(state, ep)) {
        const card = await fetch(`/api/episode?ref=${encodeURIComponent(episodeRef)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (card) await addToList({ episodeId: card.id, episodeRef: card.ref || episodeRef, showRef: card.showRef, title: card.title, feedId: card.feedId, feedTitle: card.feedTitle, image: card.image || card.feedImage, from: "a review" });
        else setAdded(false);
      }
    } catch {
      setAdded(false);
    }
  }

  return (
    <span className="review-add">
      <button
        className={`review-add__btn ${on ? "is-on" : ""}`}
        onClick={tap}
        disabled={isOwner}
        aria-pressed={on}
        aria-label={isOwner ? `${adds.length} added it to Up next` : on ? "Added to Up next" : "Add to Up next"}
        title={isOwner ? "Added to Up next from your review" : "Add to Up next"}
      >
        <Icon kind="adding" on={on} />
        {adds.length > 0 && <span className="react__n">{adds.length}</span>}
      </button>
      {added && (
        <span className="queued-toast review-add__toast" role="status">
          ✓ Added to queue
          <Link href="/me#upnext" className="queued-toast__link">
            See queue
          </Link>
        </span>
      )}
    </span>
  );
}
