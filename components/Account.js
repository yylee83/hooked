"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import { initialsOf, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

// Top-right avatar: your initials when signed in, a sign-in prompt when not.
export function AvatarLink() {
  const state = useStore();
  if (state?.accounts && !state.user) {
    return (
      <Link href="/login" className="btn btn--sm btn--shadow-sm">
        Sign in
      </Link>
    );
  }
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
      .select("episode_id, title, feed_title, image, feed_image, hooked, rating, hook, logged_at, who:profiles!inner(handle)")
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
      <h2 className="section-title">Fresh on Hooked</h2>
      <ul>
        {logs.map((l) => (
          <li key={`${l.who.handle}-${l.episode_id}`} className="fresh">
            <Art src={l.image || l.feed_image} title={l.feed_title || ""} size={60} radius={12} />
            <div className="min0 grow">
              <p className="small">
                <b>@{l.who.handle}</b> {l.hooked ? "is hooked on" : "wasn't hooked by"}
              </p>
              <Link href={`/log/${l.episode_id}`} className="title-sm" style={{ display: "block" }}>
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
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
