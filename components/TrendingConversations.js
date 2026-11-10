"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import { supabase } from "@/lib/supabase/client";
import { plural } from "@/lib/format";
import { episodeHref } from "@/lib/addresses";

// The episodes people on Hooked are talking about most this week (reviews, replies and sends).
// The database picks them (trending_conversations); this hides itself when nothing qualifies, or when that
// function hasn't been added to the database yet.
export default function TrendingConversations() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const db = supabase();
    if (!db) return;
    let live = true;
    db.rpc("trending_conversations", { max_rows: 3 }).then(({ data, error }) => live && setRows(error ? [] : data || []));
    return () => {
      live = false;
    };
  }, []);
  if (!rows?.length) return null;
  return (
    <section className="trending-convos">
      <h2 className="section-title">Trending conversations</h2>
      <ul>
        {rows.map((r) => {
          const counts = [r.reviews && plural(r.reviews, "review"), r.replies && `${r.replies} ${r.replies === 1 ? "reply" : "replies"}`, r.sends && plural(r.sends, "send")].filter(Boolean);
          return (
            <li key={r.episode_ref} className="trending-convo">
              <Art src={r.image_url || r.show_image} title={r.show_title || ""} size={60} radius={12} episodeRef={r.episode_ref} />
              <div className="min0 grow">
                <Link href={episodeHref(r.episode_ref)} className="title-sm" style={{ display: "block" }}>
                  {r.title}
                </Link>
                <p className="muted small">{r.show_title}</p>
                {counts.length > 0 && <p className="trending-convo__counts">{counts.join(" · ")}</p>}
                {r.top_hook && (
                  <p className="log__hook row gap-xs center wrap">
                    <span>“{r.top_hook}”</span>
                    <b>@{r.top_handle}</b>
                    {r.top_rating > 0 && <Stars value={Number(r.top_rating)} size={13} />}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
