"use client";
// Home, under "From people you follow": "Top conversations" (was "Trending conversations"), reviews and the talk around them, as a list (Erin,
// 2026-11-21; it was a swipe row at the top). Up to 15; past 4, the list scrolls inside a box about 500px tall
// conversations tall, fading at the bottom until you reach the end (YY, 2026-11-22). Tapping one opens that review with its replies on the episode page, ready to join in.
// First the episodes in Trending conversations (the trending_conversations database function: reviews, replies and
// sends this week), each with its best review. While Hooked is small that list is often short, so the rest are the
// recent reviews with the most going on (replies, thumbs, "+"), newest counting most.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { Avatar } from "./Friends";
import { supabase } from "@/lib/supabase/client";
import { LOG_EPISODE, withEpisode } from "@/lib/log-episode";

const MAX = 15; // conversations loaded
const SCROLL_FROM = 4; // more than this many: the list scrolls inside its own box (YY, 2026-11-22)
const DAY = 86400000;

// How much is going on under one review: like reviewScore (lib/social.js), plus recency (half as much every week).
function liveliness(log, replies, reactions) {
  const votes = reactions.reduce((n, r) => n + (r.kind === "adding" ? 3 : r.kind === "disagree" ? 1 : 2), 0);
  const age = (Date.now() - new Date(log.logged_at).getTime()) / (7 * DAY);
  return (1 + votes + 1.5 * replies.length + Math.min(2, (log.hook || "").length / 80)) * Math.pow(0.5, Math.max(0, age));
}

async function load(db) {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [trending, recent] = await Promise.all([
    db.rpc("trending_conversations", { max_rows: MAX }),
    db
      .from("logs")
      .select(`user_id, episode_ref, rating, hook, logged_at, who:profiles!logs_user_id_fkey!inner(id, handle, display_name), ${LOG_EPISODE}`)
      .not("who.handle", "is", null)
      .not("hook", "is", null)
      .neq("hook", "")
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(60),
  ]);
  const hot = trending.error ? [] : (trending.data || []).filter((r) => r.top_hook && r.top_handle);
  const logs = (recent.data || []).map(withEpisode).filter((l) => l.hook?.trim());

  // Replies (and thumbs) under these reviews, for the counts and the newest reply on each card.
  const refs = [...new Set([...hot.map((r) => r.episode_ref), ...logs.map((l) => l.episode_ref)])];
  const [comments, reactions] = refs.length
    ? await Promise.all([
        db
          .from("comments")
          .select("log_user_id, episode_ref, author_id, body, created_at, author:profiles!comments_author_id_fkey(id, handle, display_name)")
          .in("episode_ref", refs)
          .order("created_at", { ascending: false })
          .limit(300),
        db.from("reactions").select("log_user_id, episode_ref, kind").in("episode_ref", refs).limit(1000),
      ])
    : [{ data: [] }, { data: [] }];
  const under = (rows, userId, ref) => (rows || []).filter((x) => x.log_user_id === userId && x.episode_ref === ref);
  const newestReply = (userId, ref) => under(comments.data, userId, ref).find((c) => c.author_id !== userId && c.author?.handle) || null;

  const cards = [];
  const seenEp = new Set();
  const seenShow = new Set();
  const candidates = [];
  const add = (card) => candidates.push(card);
  const keep = (card) => {
    if (cards.length >= MAX || seenEp.has(card.ref) || (card.showRef && seenShow.has(card.showRef))) return;
    seenEp.add(card.ref);
    if (card.showRef) seenShow.add(card.showRef);
    cards.push(card);
  };

  for (const r of hot) {
    add({
      ref: r.episode_ref,
      showRef: r.show_id,
      title: r.title,
      show: r.show_title,
      image: r.image_url || r.show_image,
      person: { id: r.top_user_id, handle: r.top_handle },
      hook: r.top_hook,
      replies: under(comments.data, r.top_user_id, r.episode_ref).length,
      reviews: r.reviews,
      people: r.people,
      reply: newestReply(r.top_user_id, r.episode_ref),
    });
  }

  const ranked = logs
    .map((l) => {
      const replies = under(comments.data, l.user_id, l.episode_ref);
      return { l, replies, score: liveliness(l, replies, under(reactions.data, l.user_id, l.episode_ref)) };
    })
    .sort((a, b) => b.score - a.score);
  for (const { l, replies } of ranked) {
    add({
      ref: l.episode_ref,
      showRef: l.show_ref,
      title: l.title,
      show: l.feed_title,
      image: l.image || l.feed_image,
      person: l.who,
      hook: l.hook,
      replies: replies.length,
      reviews: 0,
      people: 0,
      reply: newestReply(l.user_id, l.episode_ref),
    });
  }
  // Reviews with replies come first (YY, 2026-11-20); otherwise the order above stays (trending, then liveliest).
  candidates.sort((a, b) => (b.replies > 0) - (a.replies > 0));
  candidates.forEach(keep);
  return cards;
}

export default function FeaturedDiscussions() {
  const [cards, setCards] = useState(null);
  const [atEnd, setAtEnd] = useState(false); // scrolled to the bottom of the box: drop the fade
  useEffect(() => {
    const db = supabase();
    if (!db) return setCards([]);
    let live = true;
    load(db)
      .then((c) => live && setCards(c))
      .catch(() => live && setCards([]));
    return () => {
      live = false;
    };
  }, []);

  if (cards && !cards.length) return null;
  const scrolls = (cards?.length || 0) > SCROLL_FROM;
  return (
    <section className="featured-talk" aria-label="Top conversations">
      <h2 className="section-title featured-talk__label">Top conversations</h2>
      <div
        className={`featured-talk__row ${scrolls ? "featured-talk__row--scroll" : ""} ${scrolls && atEnd ? "is-end" : ""}`}
        onScroll={scrolls ? (e) => setAtEnd(e.currentTarget.scrollTop + e.currentTarget.clientHeight >= e.currentTarget.scrollHeight - 8) : undefined}
      >
        {!cards && <div className="featured-talk__card featured-talk__card--ghost" aria-hidden="true" />}
        {cards?.map((c) => (
          <Link
            key={c.ref}
            href={`/episode/${c.ref}?from=${encodeURIComponent(c.person.handle)}&talk=1#thread`}
            className="featured-talk__card"
          >
            <p className="featured-talk__who">
              <Avatar person={c.person} size={24} />
              <span className="featured-talk__name">
                {c.person.display_name ? <b>{c.person.display_name}</b> : <b>@{c.person.handle}</b>}
                {c.person.display_name && <span className="featured-talk__handle">@{c.person.handle}</span>}
              </span>
            </p>
            <p className="featured-talk__hook">{c.hook}</p>
            {c.reply && (
              <p className="featured-talk__reply">
                ↳ <b>@{c.reply.author.handle}</b> {c.reply.body}
              </p>
            )}
            <div className="featured-talk__ep">
              <Art src={c.image} title={c.show || ""} size={30} radius={7} />
              <div className="min0 grow">
                <p className="featured-talk__title">{c.title}</p>
                <p className="featured-talk__counts">
                  {[c.reviews > 1 && `${c.reviews} reviews`, c.replies > 0 && (c.replies === 1 ? "1 reply" : `${c.replies} replies`)].filter(Boolean).join(" · ") || c.show}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
