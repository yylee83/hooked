"use client";
// Reactions and replies under one person's log of one episode.
import { useRef, useState } from "react";
import Link from "next/link";
import { addToList, useStore } from "@/lib/store";
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

export default function LogThread({ logUserId, episodeId, defaultOpen = false, id }) {
  const state = useStore();
  const data = useThread(logUserId, episodeId);
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);
  const [tip, setTip] = useState(null); // reaction name shown while pressing and holding
  const holdTimer = useRef(null);
  const held = useRef(false); // a press-and-hold shows the name; it shouldn't also count as a tap

  if (!logUserId || !episodeId || (state && !state.accounts)) return null;

  const me = state?.user || null;
  const reactions = data?.reactions || [];
  const comments = data?.comments || [];
  const counts = Object.fromEntries(REACTIONS.map((r) => [r.kind, reactions.filter((x) => x.kind === r.kind).length]));
  const mine = new Set(reactions.filter((x) => x.user_id === me?.id).map((x) => x.kind));
  const isOwner = me?.id === logUserId;
  // Everyone else sees all four; on your own review, only the ones people used.
  const shown = isOwner ? REACTIONS.filter((r) => counts[r.kind] > 0) : REACTIONS;
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
      const on = await toggleReaction(me, logUserId, episodeId, kind);
      // "Adding it" also puts the episode in your Up next.
      if (kind === "adding" && on && !state?.list?.some((i) => String(i.episodeId) === String(episodeId))) {
        const ep = await fetch(`/api/episode?id=${episodeId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (ep) {
          await addToList({ episodeId: ep.id, title: ep.title, feedId: ep.feedId, feedTitle: ep.feedTitle, image: ep.image || ep.feedImage, from: "a review" });
          setAdded(true);
        }
      }
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
      await postComment(me, state.profile, logUserId, episodeId, text);
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

      {added && (
        <p className="small thread__note">
          Added to your{" "}
          <Link href="/me#upnext" className="u-link">
            Up next
          </Link>
          .
        </p>
      )}
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
