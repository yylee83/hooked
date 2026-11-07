"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Art from "./Art";
import Stars from "./Stars";
import { initialsOf, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import LogThread, { ReviewAdd } from "./LogThread";
import { reviewScore } from "@/lib/social";
import { episodeHref, logHref } from "@/lib/addresses";

// Top-right avatar: your initials when signed in, a sign-in prompt when not.
// "Sign in" for page headers. Shows only when signed out, and brings you back here afterwards.
export function SignInButton() {
  const state = useStore();
  const path = usePathname();
  if (!state?.accounts || state.user) return null;
  const next = path && path !== "/login" ? `?next=${encodeURIComponent(path)}` : "";
  return (
    <Link href={`/login${next}`} className="btn btn--sm btn--shadow-sm">
      Sign in
    </Link>
  );
}

export function AvatarLink() {
  const state = useStore();
  if (state?.accounts && !state.user) return <SignInButton />;
  return (
    <Link href="/me" className="avatar" aria-label="My log">
      {state?.user ? initialsOf(state.profile) : "me"}
    </Link>
  );
}

// The newest logs from everyone on Hooked.
export function FreshLogs() {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    const db = supabase();
    if (!db) return setLogs([]);
    let live = true;
    db.from("logs")
      .select("user_id, episode_id, episode_ref, title, feed_id, feed_title, image, feed_image, hooked, rating, hook, logged_at, who:profiles!logs_user_id_fkey!inner(handle)")
      .not("who.handle", "is", null)
      .order("logged_at", { ascending: false })
      .limit(8)
      .then(({ data }) => live && setLogs(data || []));
    return () => {
      live = false;
    };
  }, []);
  if (!logs?.length) return null;
  return (
    <>
      <h2 className="section-title">Just logged</h2>
      <ul>
        {logs.map((l) => (
          <li key={`${l.who.handle}-${l.episode_ref || l.episode_id}`} className="fresh">
            <Art src={l.image || l.feed_image} title={l.feed_title || ""} size={60} radius={12} episodeRef={l.episode_ref} episodeId={l.episode_id} feedId={l.feed_id} />
            <div className="min0 grow">
              <p className="small">
                <b>@{l.who.handle}</b> {l.hooked ? "is hooked on" : "wasn't hooked by"}
              </p>
              <Link href={episodeHref(l.episode_ref, l.episode_id)} className="title-sm" style={{ display: "block" }}>
                {l.title}
              </Link>
              <p className="muted small row gap-xs center wrap">
                {l.feed_title}
                {l.rating > 0 && (
                  <>
                    <span>·</span>
                    <Stars value={Number(l.rating)} size={14} />
                  </>
                )}
              </p>
              {l.hook && <p className="log__hook">“{l.hook}”</p>}
              <LogThread logUserId={l.user_id} episodeRef={l.episode_ref} episodeId={l.episode_id} />
            </div>
            <div className="fresh__side">
              <ReviewAdd logUserId={l.user_id} episodeRef={l.episode_ref} episodeId={l.episode_id} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

// What people on Hooked said about one episode.
export function EpisodeLogs({ episodeId, episodeRef }) {
  const state = useStore();
  const me = state?.user?.id;
  let [logs, setLogs] = useState(null);
  useEffect(() => {
    const db = supabase();
    if (!db) return setLogs([]);
    let live = true;
    // Matched by our episode id (episodes Podcast Index doesn't have only have that).
    const col = episodeRef ? "episode_ref" : "episode_id";
    const key = episodeRef || episodeId;
    // Reviews, plus every reaction and reply on them, so the most useful reviews can go first.
    Promise.all([
      db
        .from("logs")
        .select("user_id, hooked, rating, hook, logged_at, who:profiles!logs_user_id_fkey!inner(handle)")
        .eq(col, key)
        .not("who.handle", "is", null)
        .order("logged_at", { ascending: false })
        .limit(50),
      db.from("reactions").select("log_user_id, kind").eq(col, key).limit(2000),
      db.from("comments").select("log_user_id").eq(col, key).limit(2000),
    ]).then(([l, r, c]) => {
      if (!live) return;
      const by = (rows, id) => (rows || []).filter((x) => x.log_user_id === id);
      const scored = (l.data || []).map((x) => ({
        ...x,
        score: reviewScore({ reactions: by(r.data, x.user_id), comments: by(c.data, x.user_id), hook: x.hook }),
      }));
      scored.sort((a, b) => b.score - a.score || new Date(b.logged_at) - new Date(a.logged_at));
      setLogs(scored.slice(0, 20));
    });
    return () => {
      live = false;
    };
  }, [episodeId, episodeRef, me]);
  if (!logs?.length) return null;
  const hooked = logs.filter((l) => l.hooked).length;
  // Your own review first.
  if (me) logs = [...logs.filter((l) => l.user_id === me), ...logs.filter((l) => l.user_id !== me)];
  return (
    <section>
      <h2 className="label">What listeners think</h2>
      {logs.length > 2 && <p className="muted small" style={{ marginTop: -4 }}>Most useful reviews first.</p>}
      <p className="mono small" style={{ marginBottom: 6 }}>
        {hooked} of {logs.length} hooked
      </p>
      <ul>
        {logs.map((l) => (
          <li key={l.who.handle} className="fresh">
            <div className="min0 grow">
              <p className="small row gap-xs center wrap">
                <b>{l.user_id === me ? "You" : `@${l.who.handle}`}</b>
                <span className={`sticker ${l.hooked ? "" : "sticker--outline"}`} style={{ fontSize: 11, padding: "2px 8px" }}>
                  {l.hooked ? "Hooked" : "Not hooked"}
                </span>
                {l.rating > 0 && <Stars value={Number(l.rating)} size={14} />}
              </p>
              {l.hook && <p className="log__hook">“{l.hook}”</p>}
              {l.user_id === me && (
                <Link href={logHref(episodeRef, episodeId)} className="link-btn small">
                  Edit your review
                </Link>
              )}
              <LogThread logUserId={l.user_id} episodeRef={episodeRef} episodeId={episodeId} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
