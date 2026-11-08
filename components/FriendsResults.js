"use client";
// Search's "Friends' episodes" filter: only episodes people you follow have logged, matching your words
// (in the title, the show, what they wrote, or the episode's description), with who logged it, their
// stars and hook line. Runs in the browser, where we know who you follow.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EpisodeRow from "./EpisodeRow";
import Stars from "./Stars";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import { withEpisode } from "@/lib/log-episode";
import { rankResults } from "@/lib/rank";

// Like LOG_EPISODE, plus the description so topic words match too.
const EPISODE = "episode:episodes!logs_episode_ref_fkey(id, podcastindex_id, title, image_url, audio_url, duration_seconds, published_at, description_text, show:shows(id, podcastindex_id, title, image_url))";
const MAX_LOGS = 1000; // friends' logs read once, then searched here as you change the words

export default function FriendsResults({ query }) {
  const state = useStore();
  const ids = (state?.following || []).map((f) => f.id).sort().join(",");
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    const db = supabase();
    if (!db || !state?.user || !ids) return;
    let live = true;
    db.from("logs")
      .select(`user_id, episode_ref, hooked, rating, hook, logged_at, who:profiles!logs_user_id_fkey!inner(id, handle, display_name), ${EPISODE}`)
      .in("user_id", ids.split(","))
      .order("logged_at", { ascending: false })
      .limit(MAX_LOGS)
      .then(({ data }) => live && setLogs(data || []));
    return () => {
      live = false;
    };
  }, [state?.user, ids]);

  // One result per episode, with every friend who logged it.
  const results = useMemo(() => {
    if (!logs || !query) return [];
    const byEpisode = new Map();
    for (const row of logs) {
      const l = withEpisode(row);
      if (!l.episode_ref) continue;
      let g = byEpisode.get(l.episode_ref);
      if (!g) {
        g = {
          ep: {
            ref: l.episode_ref,
            id: l.episode_id ?? undefined,
            showRef: l.show_ref || undefined,
            feedId: l.feed_id ?? undefined,
            title: l.title,
            feedTitle: l.feed_title,
            image: l.image,
            feedImage: l.feed_image,
            audio: l.audio || "",
            duration: l.duration || 0,
            date: row.episode?.published_at ? Math.floor(new Date(row.episode.published_at).getTime() / 1000) : 0,
          },
          description: row.episode?.description_text || "",
          logs: [],
        };
        byEpisode.set(l.episode_ref, g);
      }
      g.logs.push(l);
    }
    const fields = (g) => [
      { text: g.ep.title, weight: 3 },
      { text: g.ep.feedTitle, weight: 1.5 },
      { text: g.logs.map((l) => l.hook || "").join(" · "), weight: 2 },
      { text: g.description.slice(0, 3000), weight: 1 },
    ];
    // Best match first; among equal matches, the episode more friends logged.
    return rankResults(query, [...byEpisode.values()], fields, (g) => g.logs.length, (g) => (g.logs.length - 1) * 15);
  }, [logs, query]);

  if (!state) return null;
  if (!state.user) {
    return (
      <section className="card friends-cta">
        <p style={{ margin: "0 0 14px" }}>Sign in to search the episodes your friends have logged.</p>
        <Link href="/login?next=/search" className="btn btn--cobalt btn--shadow-sm">
          Sign in
        </Link>
      </section>
    );
  }
  if (!ids) {
    return (
      <section className="card friends-cta">
        <p style={{ margin: "0 0 14px" }}>Follow people to search the episodes they’ve logged.</p>
        <Link href="/people" className="btn btn--cobalt btn--shadow-sm">
          Find friends
        </Link>
      </section>
    );
  }
  if (!query) return <p className="muted">Type a show, a person or a topic to search what your friends have logged.</p>;
  if (!logs) return <p className="muted">Looking through your friends’ logs…</p>;

  return (
    <section>
      <h2 className="label">Friends’ episodes</h2>
      {results.length === 0 ? (
        <p className="muted">None of your friends have logged an episode about “{query}” yet.</p>
      ) : (
        <ul>
          {results.map((g) => (
            <EpisodeRow key={g.ep.ref} ep={g.ep}>
              <ul className="friend-takes">
                {g.logs.map((l) => (
                  <li key={l.user_id} className="friend-takes__row">
                    <p className="small row gap-xs center wrap">
                      <Link href={`/u/${l.who.handle}`}>
                        <b>@{l.who.handle}</b>
                      </Link>
                      <span className="muted">{l.hooked ? "hooked" : "not hooked"}</span>
                      {l.rating > 0 && <Stars value={Number(l.rating)} size={14} />}
                    </p>
                    {l.hook && <p className="log__hook">“{l.hook}”</p>}
                  </li>
                ))}
              </ul>
            </EpisodeRow>
          ))}
        </ul>
      )}
    </section>
  );
}
