"use client";
// Home's top row, "Trending episodes" (Erin, 2026-11-21): the episodes with the most going on lately (logs, replies,
// sends, thumbs and "+", Up next adds), from the trending_episodes database function. A swipe row of small cards like
// New episodes, each with play and + Up next. Only totals come back, never who did what. Hidden until there are 2.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { PlayButton } from "./Player";
import { QueueButton } from "./Social";
import { supabase } from "@/lib/supabase/client";
import { episodeHref } from "@/lib/addresses";
import { plural } from "@/lib/format";
import { useRefreshTick } from "@/lib/home-refresh";

const MAX = 10;

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
  const [rows, setRows] = useState(null);
  const tick = useRefreshTick();

  useEffect(() => {
    const db = supabase();
    if (!db) return setRows([]);
    let live = true;
    db.rpc("trending_episodes", { max_rows: MAX })
      .then(({ data, error }) => live && setRows(error ? [] : (data || []).filter((r) => r.audio_url)))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [tick]);

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
