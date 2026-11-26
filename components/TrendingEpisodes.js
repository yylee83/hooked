"use client";
// Home's top row, "Trending episodes" (Erin, 2026-11-21): the episodes with the most going on lately (logs, replies,
// sends, thumbs and "+", Up next adds), from the trending_episodes database function. A swipe row of small cards like
// New episodes, each with play and + Up next. Only totals come back, never who did what. Hidden until there are 2.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { PlayButton } from "./Player";
import { QueueButton } from "./Social";
import { supabase } from "@/lib/supabase/client";
import { episodeHref } from "@/lib/addresses";
import { plural } from "@/lib/format";
import { useRefreshTick } from "@/lib/home-refresh";
import { findLog, useStore } from "@/lib/store";
import { freshOrder, recentLeads, rememberLead, withLuck } from "@/lib/fresh-order";

const MAX = 10;
const ASK = 20; // a few more than shown, so ones you've logged can make room (YY, 2026-11-26)

// "4 people · 2 replies": who's into it, then the liveliest kind of activity.
function activity(r) {
  const parts = [];
  if (r.people > 1) parts.push(`${r.people} people`);
  if (r.replies > 0) parts.push(r.replies === 1 ? "1 reply" : `${r.replies} replies`);
  else if (r.sends > 0) parts.push(plural(r.sends, "send"));
  else if (r.logs > 1) parts.push(plural(r.logs, "log"));
  return parts.join(" · ") || "New activity";
}

export default function TrendingEpisodes() {
  const state = useStore();
  const [got, setGot] = useState(null); // { rows, recent, visit }
  const tick = useRefreshTick();

  useEffect(() => {
    const db = supabase();
    if (!db) return setGot({ rows: [] });
    let live = true;
    db.rpc("trending_episodes", { max_rows: ASK })
      .then(({ data, error }) => {
        if (!live) return;
        // Each load (a visit or a pull to refresh) is a new turn: new draws, and what led before is read again.
        const rows = error ? [] : withLuck((data || []).filter((r) => r.audio_url));
        setGot({ rows, recent: recentLeads("trending-eps"), visit: Date.now() });
      })
      .catch(() => live && setGot({ rows: [] }));
    return () => {
      live = false;
    };
  }, [tick]);

  // Not the same episode first every visit (YY, 2026-11-26): a light shuffle of the top few, what led lately pushed
  // down, and episodes you've logged at the end (lib/fresh-order.js).
  const logs = state?.logs;
  const rows = useMemo(
    () =>
      got &&
      freshOrder(got.rows, {
        key: (r) => r.episode_ref,
        weight: (r) => (r.score || 0.1) * (r.people >= 2 ? 1.5 : 1),
        done: (r) => !!findLog({ logs }, { ref: r.episode_ref }),
        recent: got.recent,
      }).slice(0, MAX),
    [got, logs]
  );
  const lead = rows?.[0]?.episode_ref;
  const visit = got?.visit;
  useEffect(() => {
    if (lead && visit) rememberLead("trending-eps", lead, visit);
  }, [lead, visit]);

  if (rows && rows.length < 2) return null;
  return (
    <section className="trending-eps">
      <h2 className="section-title">Trending episodes</h2>
      <div className="trending-eps__row">
        {!rows
          ? [0, 1, 2].map((i) => (
              <div key={i} className="trending-eps__card trending-eps__card--ghost" aria-hidden="true">
                <span className="trending-eps__ghost-art" />
                <span className="trending-eps__ghost-line" />
              </div>
            ))
          : rows.map((r) => {
              const art = r.image_url || r.show_image || "";
              const ep = {
                ref: r.episode_ref,
                title: r.title,
                feedTitle: r.show_title || "",
                image: art,
                feedImage: r.show_image || "",
                audio: r.audio_url,
                duration: r.duration_seconds || 0,
                showRef: r.show_id,
              };
              return (
                <article key={r.episode_ref} className="trending-eps__card">
                  <Art src={art} title={ep.feedTitle} size="100%" radius={12} className="art--fluid" episodeRef={ep.ref} />
                  <Link href={episodeHref(ep.ref)} className="trending-eps__title">
                    {ep.title}
                  </Link>
                  <p className="trending-eps__show">{ep.feedTitle}</p>
                  <p className="trending-eps__activity mono">{activity(r)}</p>
                  <div className="trending-eps__acts">
                    <PlayButton episode={ep} icon />
                    <QueueButton episode={ep} icon />
                  </div>
                </article>
              );
            })}
      </div>
    </section>
  );
}
