"use client";
// Following, finding people, and the friends feed.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import ListeningOnHooked from "./ListeningOnHooked";
import InviteCard from "./InviteCard";
import { logVerb, plural } from "@/lib/format";
import { addToList, dismissRecommendation, findLog, follow, inUpNext, initialsOf, isBlocked, unfollow, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import LogThread, { ReviewAdd } from "./LogThread";
import { episodeHref } from "@/lib/addresses";
import { LOG_EPISODE, episodeOf, withEpisode } from "@/lib/log-episode";
import DiscoverPeople from "./DiscoverPeople";
import { timeAgo } from "@/lib/social";
import { useRefreshTick } from "@/lib/home-refresh";

const HOUR = 3600 * 1000;

export function Avatar({ person, size = 48 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initialsOf(person, "?")}
    </span>
  );
}

export function FollowButton({ person, small = false, label = "Follow" }) {
  const state = useStore();
  const [error, setError] = useState("");
  if (!state?.accounts) return null;
  if (state.user?.id === person.id || isBlocked(state, person.id)) return null;
  if (!state.user) {
    return (
      <Link href={`/login?next=/u/${person.handle}`} className={`btn btn--cobalt ${small ? "btn--sm" : "btn--shadow-sm"}`}>
        Follow
      </Link>
    );
  }
  const on = state.following?.some((f) => f.id === person.id);
  return (
    <span className="follow">
      <button
        className={`btn ${small ? "btn--sm" : "btn--shadow-sm"} ${on ? "" : "btn--cobalt"}`}
        onClick={async () => {
          setError("");
          try {
            on ? await unfollow(person) : await follow(person);
          } catch (e) {
            setError(e.message);
          }
        }}
        aria-pressed={on}
      >
        {on ? "Following" : label}
      </button>
      {error && <span className="nudge small">{error}</span>}
    </span>
  );
}

export function PersonRow({ p }) {
  return (
    <li className="person">
      <Link href={`/u/${p.handle}`} className="person__who">
        <Avatar person={p} />
        <span className="min0">
          <span className="person__name">{p.display_name || `@${p.handle}`}</span>
          {p.display_name && <span className="person__handle">@{p.handle}</span>}
        </span>
      </Link>
      <FollowButton person={p} small />
    </li>
  );
}

// "Find friends": search by handle or name, see who you follow, invite people.
export function PeopleFinder() {
  const state = useStore();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);

  useEffect(() => {
    const db = supabase();
    const term = q.trim().replace(/^@/, "").replace(/[%_,()]/g, "");
    if (!db || term.length < 2) return setResults(null);
    let live = true;
    const t = setTimeout(() => {
      db.from("profiles")
        .select("id, handle, display_name")
        .not("handle", "is", null)
        .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`)
        .limit(20)
        .then(({ data }) => live && setResults(data || []));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  if (state && !state.accounts) return <p className="muted">Profiles aren't switched on yet.</p>;

  const me = state?.user?.id;
  const notMe = (list) => list.filter((p) => p.id !== me);

  return (
    <>
      <div className="search" role="search" style={{ marginTop: 18 }}>
        <input
          className="input"
          type="search"
          placeholder="Search by name or @handle"
          aria-label="Search people"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {results && (
        <section>
          <h2 className="label">Results</h2>
          {notMe(results).length === 0 ? (
            <p className="muted">No one by that name yet. Invite them below.</p>
          ) : (
            <ul>{notMe(results).map((p) => <PersonRow key={p.id} p={p} />)}</ul>
          )}
        </section>
      )}

      <DiscoverPeople />

      <InviteCard />

    </>
  );
}

// The friends section of the Home tab, built from the people you follow.
// "From people you follow": 15 at first, then Show more adds 15 at a time (Erin, 2026-11-21), up to the newest 60.
const FRIEND_LOGS_PAGE = 15;
const FRIEND_LOGS_MAX = 60;

export function FriendsFeed() {
  const state = useStore();
  const [data, setData] = useState(null);
  const [allSent, setAllSent] = useState(false);
  const [shownLogs, setShownLogs] = useState(FRIEND_LOGS_PAGE);
  const ids = (state?.following || []).map((f) => f.id).sort().join(",");
  const tick = useRefreshTick();

  useEffect(() => {
    const db = supabase();
    if (!db || !state?.user) return;
    let live = true;
    const followIds = ids ? ids.split(",") : [];
    Promise.all([
      db
        .from("recommendations")
        .select(`id, episode_ref, rating, hook, note, created_at, sender:profiles!recommendations_from_id_fkey(id, handle, display_name), ${episodeOf("recommendations")}`)
        .eq("to_id", state.user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      followIds.length
        ? db
            .from("profiles")
            .select("id, handle, display_name, now_playing, now_playing_at")
            .in("id", followIds)
            .gte("now_playing_at", new Date(Date.now() - 24 * HOUR).toISOString())
            .order("now_playing_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      followIds.length
        ? db
            .from("logs")
            .select(`user_id, episode_ref, rating, hook, logged_at, who:profiles!logs_user_id_fkey!inner(id, handle, display_name), ${LOG_EPISODE}`)
            .in("user_id", followIds)
            .order("logged_at", { ascending: false })
            .limit(FRIEND_LOGS_MAX)
        : Promise.resolve({ data: [] }),
    ]).then(async ([r, n, l]) => {
      const listening = (n.data || []).filter((p) => p.now_playing?.id || p.now_playing?.ref);
      // Some plays were saved without a cover: use the episode's (or its show's) from our tables.
      const missing = listening.filter((p) => !p.now_playing.image && p.now_playing.ref).map((p) => p.now_playing.ref);
      if (missing.length) {
        const { data: eps } = await db.from("episodes").select("id, image_url, show:shows(image_url)").in("id", missing);
        const art = new Map((eps || []).map((e) => [e.id, e.image_url || e.show?.image_url || ""]));
        for (const p of listening) if (!p.now_playing.image && p.now_playing.ref) p.now_playing = { ...p.now_playing, image: art.get(p.now_playing.ref) || "" };
      }
      if (live) setData({ recs: (r.data || []).map(withEpisode), listening, logs: (l.data || []).map(withEpisode), error: r.error });
    });
    return () => {
      live = false;
    };
  }, [state?.user?.id, ids, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || !state.accounts) return null;

  if (!state.user) {
    return (
      <section className="card friends-cta">
        <p className="display h-md" style={{ margin: 0 }}>Podcasts are better with friends.</p>
        <p style={{ margin: "8px 0 16px" }}>Follow people to see what they're listening to, what they're hooked on, and what they send you.</p>
        <div className="row gap wrap">
          <Link href="/login?mode=signup" className="btn btn--cobalt btn--shadow-sm">
            Make a profile
          </Link>
          <Link href="/login" className="btn">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  const noFollows = !state.following?.length;
  // A send leaves the list once you've put it in Up next or logged it. Sends of the same episode (from one friend or
  // several) are one row: newest first, everyone who sent it, each different note.
  const groups = new Map();
  for (const r of data?.recs || []) {
    const ep = { ref: r.episode_ref, id: r.episode_id };
    if (inUpNext(state, ep) || findLog(state, ep)) continue;
    const k = r.episode_ref || `p${r.episode_id}`;
    if (groups.has(k)) groups.get(k).push(r);
    else groups.set(k, [r]);
  }
  const sent = [...groups.values()];

  return (
    <>
      {sent.length > 0 && (
        <>
          <h2 className="section-title">Sent to you</h2>
          <ul className="sent">
            {(allSent ? sent : sent.slice(0, 2)).map((g) => (
              <SentRow key={g[0].id} sends={g} onDismiss={() => setData({ ...data, recs: data.recs.filter((x) => !g.includes(x)) })} />
            ))}
          </ul>
          {sent.length > 2 && (
            <button className="link-btn small sent__more" onClick={() => setAllSent(!allSent)} aria-expanded={allSent}>
              {allSent ? "Show fewer" : `Show all ${sent.length}`}
            </button>
          )}
        </>
      )}

      {/* No friends have played anything in the last day: what everyone on Hooked is listening to (no names). */}
      {data && !data.listening?.length && <ListeningOnHooked always />}

      {data?.listening?.length > 0 && (
        <>
          <h2 className="section-title">Friends listening now</h2>
          <div className="np-row">
            {data.listening.map((p, i) => (
              <Link key={p.id} href={episodeHref(p.now_playing.ref, p.now_playing.id)} className="np">
                <Art src={p.now_playing.image} title={p.now_playing.feedTitle || ""} size={150} tilt={[-2, 1.5, -1][i % 3]} radius={22} />
                <p className="np__who">@{p.handle}</p>
                <p className="np__show">{p.now_playing.feedTitle || p.now_playing.title}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      {noFollows ? (
        <section className="card friends-cta">
          <p className="display h-md" style={{ margin: 0 }}>Find your people.</p>
          <p style={{ margin: "8px 0 16px" }}>Follow friends to fill this page with what they're hooked on.</p>
          <Link href="/people" className="btn btn--cobalt btn--shadow-sm">
            Find friends
          </Link>
        </section>
      ) : (
        <>
          <div className="row center" style={{ justifyContent: "space-between" }}>
            <h2 className="section-title">From people you follow</h2>
          </div>
          {data && data.logs.length === 0 && <p className="muted">Nothing logged yet. Nudge them.</p>}
          <ul>
            {(data?.logs || []).slice(0, shownLogs).map((l) => (
              <li key={`${l.who.id}-${l.episode_ref || l.episode_id}`} className="fresh">
                <Art src={l.image || l.feed_image} title={l.feed_title || ""} size={60} radius={12} episodeRef={l.episode_ref} episodeId={l.episode_id} />
                <div className="min0 grow">
                  <p className="small">
                    <Link href={`/u/${l.who.handle}`}>
                      <b>@{l.who.handle}</b>
                    </Link>{" "}
                    {logVerb(l)}
                    {l.logged_at && (
                      <time className="muted" dateTime={l.logged_at} title={new Date(l.logged_at).toLocaleString()}>
                        {" "}
                        · {timeAgo(l.logged_at)}
                      </time>
                    )}
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
                  <LogThread logUserId={l.user_id} episodeRef={l.episode_ref} episodeId={l.episode_id} handle={l.who?.handle} />
                </div>
                <div className="fresh__side">
                  <ReviewAdd logUserId={l.user_id} episodeRef={l.episode_ref} episodeId={l.episode_id} />
                </div>
              </li>
            ))}
          </ul>
          {(data?.logs?.length || 0) > shownLogs && (
            <button className="btn friends-feed__more" onClick={() => setShownLogs((n) => n + FRIEND_LOGS_PAGE)}>
              Show more
            </button>
          )}
        </>
      )}
    </>
  );
}

// One send on Home: who sent it, the episode, their note. + adds it to Up next (and it leaves the list); × is "not for me".
// Who sent it: "@a", "@a and @b", "@a, @b and 2 others".
function senderNames(handles) {
  const names = handles.map((h) => (h ? `@${h}` : "a friend"));
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${plural(names.length - 2, "other")}`;
}

// One episode sent to you: `sends` are its sends, newest first (one or more, from one friend or several).
function SentRow({ sends, onDismiss }) {
  const r = sends[0];
  const handles = [...new Set(sends.map((x) => x.sender?.handle || ""))];
  const several = handles.length > 1;
  // Each different note once, with who wrote it when more than one person sent the episode.
  const seen = new Set();
  const notes = [];
  for (const x of sends) {
    const text = (x.note || x.hook || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    notes.push({ id: x.id, text, who: several ? x.sender?.handle : null });
  }
  const item = { episodeId: r.episode_id, episodeRef: r.episode_ref || undefined, title: r.title, feedId: r.feed_id, feedTitle: r.feed_title, image: r.image, from: senderNames(handles) };
  return (
    <li className="sent__row">
      <Link href={episodeHref(r.episode_ref, r.episode_id)} className="sent__main">
        <Art src={r.image} title={r.feed_title || ""} size={48} radius={10} />
        <span className="min0">
          <span className="sent__who">
            <b>{senderNames(handles)}</b> sent you
          </span>
          <span className="sent__title">{r.title}</span>
          {notes.map((n) => (
            <span key={n.id} className="sent__note">
              {n.who ? `@${n.who}: ` : ""}“{n.text}”
            </span>
          ))}
        </span>
      </Link>
      <button
        className="sent__x"
        aria-label={`Not for me: ${r.title}`}
        title="Not for me"
        onClick={async () => {
          onDismiss();
          await Promise.all(sends.map((x) => dismissRecommendation(x.id)));
        }}
      >
        ×
      </button>
      <button className="sent__add" aria-label={`Add ${r.title} to Up next`} title="Add to Up next" onClick={() => addToList(item)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
          <path d="M12 4.5v15M4.5 12h15" />
        </svg>
      </button>
    </li>
  );
}
