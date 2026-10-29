"use client";
// Following, finding people, and the friends feed.
import { useEffect, useState } from "react";
import Link from "next/link";
import Art from "./Art";
import Stars from "./Stars";
import { addToList, dismissRecommendation, follow, initialsOf, unfollow, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";
import LogThread from "./LogThread";
import { site } from "@/lib/site";

const HOUR = 3600 * 1000;

export function Avatar({ person, size = 48 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {initialsOf(person, "?")}
    </span>
  );
}

export function FollowButton({ person, small = false }) {
  const state = useStore();
  const [error, setError] = useState("");
  if (!state?.accounts) return null;
  if (state.user?.id === person.id) return null;
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
        {on ? "Following" : "Follow"}
      </button>
      {error && <span className="nudge small">{error}</span>}
    </span>
  );
}

function PersonRow({ p }) {
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
  const [suggested, setSuggested] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const db = supabase();
    if (!db) return;
    db.from("profiles")
      .select("id, handle, display_name")
      .not("handle", "is", null)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setSuggested(data || []));
  }, []);

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
  const followingIds = new Set((state?.following || []).map((f) => f.id));
  const notMe = (list) => list.filter((p) => p.id !== me);
  const suggestions = notMe(suggested).filter((p) => !followingIds.has(p.id)).slice(0, 10);

  async function invite() {
    const url = window.location.origin;
    const text = `I'm logging podcasts on ${site.name}. Come see what I'm hooked on${state?.profile?.handle ? ` (I'm @${state.profile.handle})` : ""}.`;
    const target = state?.profile?.handle ? `${url}/u/${state.profile.handle}` : url;
    if (navigator.share) {
      try {
        await navigator.share({ title: site.name, text, url: target });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(`${text} ${target}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

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
          autoFocus
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

      <div className="card invite">
        <p className="display h-md" style={{ margin: 0 }}>Bring your friends.</p>
        <p style={{ margin: "6px 0 14px" }}>Send them a link to your profile. They can browse it without signing up.</p>
        <button className="btn btn--cobalt btn--shadow-sm" onClick={invite}>
          {copied ? "Link copied" : "Invite friends"}
        </button>
      </div>

      {state?.following?.length > 0 && (
        <section>
          <h2 className="label">You follow</h2>
          <ul>{state.following.map((p) => <PersonRow key={p.id} p={p} />)}</ul>
        </section>
      )}

      {suggestions.length > 0 && (
        <section>
          <h2 className="label">New on {site.name}</h2>
          <ul>{suggestions.map((p) => <PersonRow key={p.id} p={p} />)}</ul>
        </section>
      )}
    </>
  );
}

// The friends section of the Home tab, built from the people you follow.
export function FriendsFeed() {
  const state = useStore();
  const [data, setData] = useState(null);
  const ids = (state?.following || []).map((f) => f.id).sort().join(",");

  useEffect(() => {
    const db = supabase();
    if (!db || !state?.user) return;
    let live = true;
    const followIds = ids ? ids.split(",") : [];
    Promise.all([
      db
        .from("recommendations")
        .select("*, sender:profiles!recommendations_from_id_fkey(id, handle, display_name)")
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
            .select("*, who:profiles!logs_user_id_fkey!inner(id, handle, display_name)")
            .in("user_id", followIds)
            .order("logged_at", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] }),
    ]).then(([r, n, l]) => {
      if (live) setData({ recs: r.data || [], listening: (n.data || []).filter((p) => p.now_playing?.id), logs: l.data || [], error: r.error });
    });
    return () => {
      live = false;
    };
  }, [state?.user?.id, ids]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <>
      {data?.listening?.length > 0 && (
        <>
          <h2 className="section-title">Listening now</h2>
          <div className="np-row">
            {data.listening.map((p, i) => (
              <Link key={p.id} href={`/episode/${p.now_playing.id}`} className="np">
                <Art src={p.now_playing.image} title={p.now_playing.feedTitle || ""} size={150} tilt={[-2, 1.5, -1][i % 3]} radius={22} />
                <p className="np__who">@{p.handle}</p>
                <p className="np__show">{p.now_playing.feedTitle || p.now_playing.title}</p>
              </Link>
            ))}
          </div>
        </>
      )}

      {data?.recs?.length > 0 && (
        <>
          <h2 className="section-title">Sent to you</h2>
          {data.recs.map((r) => (
            <RecCard key={r.id} r={r} onDismiss={() => setData({ ...data, recs: data.recs.filter((x) => x.id !== r.id) })} />
          ))}
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
            {(data?.logs || []).map((l) => (
              <li key={`${l.who.id}-${l.episode_id}`} className="fresh">
                <Art src={l.image || l.feed_image} title={l.feed_title || ""} size={60} radius={12} episodeId={l.episode_id} />
                <div className="min0 grow">
                  <p className="small">
                    <Link href={`/u/${l.who.handle}`}>
                      <b>@{l.who.handle}</b>
                    </Link>{" "}
                    {l.hooked ? "is hooked on" : "wasn't hooked by"}
                  </p>
                  <Link href={`/episode/${l.episode_id}`} className="title-sm" style={{ display: "block" }}>
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
                  <LogThread logUserId={l.user_id} episodeId={l.episode_id} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function RecCard({ r, onDismiss }) {
  const state = useStore();
  const item = { episodeId: r.episode_id, title: r.title, feedId: r.feed_id, feedTitle: r.feed_title, image: r.image, from: r.sender?.handle ? `@${r.sender.handle}` : "a friend" };
  const saved = state?.list?.some((i) => String(i.episodeId) === String(r.episode_id));
  return (
    <article className="card rec">
      <div className="rec__head">
        <p>
          <Link href={`/u/${r.sender?.handle || ""}`}>
            <b>@{r.sender?.handle || "a friend"}</b>
          </Link>{" "}
          thinks you'd enjoy this
        </p>
        {r.hooked && <span className="sticker">Hooked</span>}
      </div>
      <div className="rec__body">
        <Art src={r.image} title={r.feed_title || ""} size={96} radius={16} episodeId={r.episode_id} />
        <div className="min0">
          <Link href={`/episode/${r.episode_id}`} className="rec__title">
            {r.title}
          </Link>
          <p className="muted row gap-xs center wrap" style={{ marginTop: 4 }}>
            {r.feed_title}
            {r.rating > 0 && (
              <>
                <span>·</span>
                <Stars value={Number(r.rating)} size={18} />
              </>
            )}
          </p>
        </div>
      </div>
      {(r.note || r.hook) && <p className="rec__hook">“{r.note || r.hook}”</p>}
      <div className="row gap">
        <button className={`btn btn--shadow-sm ${saved ? "btn--butter" : "btn--cobalt"}`} onClick={() => !saved && addToList(item)}>
          {saved ? "✓ Up next" : "+ Up next"}
        </button>
        <button
          className="btn"
          onClick={async () => {
            onDismiss();
            await dismissRecommendation(r.id);
          }}
        >
          Not for me
        </button>
      </div>
    </article>
  );
}
