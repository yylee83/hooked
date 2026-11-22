"use client";
// Finding people to follow, at the top of People → Find people (YY, 2026-11-22: "this site only works if it's social").
// - Suggested follows: people into the same shows as you (shows you hooked or logged an episode of), then the most
//   active reviewers of the past month. Built from public logs and hooked shows only.
// - New on Hooked on Pods: the newest accounts.
// Both leave out you and anyone you already followed when the page opened. Someone you follow here stays in the list
// (the button turns to "Following") so it doesn't jump around.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Avatar, FollowButton } from "./Friends";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

const WHO = "id, handle, display_name, created_at";
const SUGGESTED = 5;
const NEW_PAGE = 8;
const NEW_MAX = 40;
const DAY = 86400 * 1000;

function joined(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (days < 1) return "Joined today";
  if (days < 2) return "Joined yesterday";
  if (days < 7) return `Joined ${days} days ago`;
  return `Joined ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function DiscoverRow({ p, why }) {
  return (
    <li className="person">
      <Link href={`/u/${p.handle}`} className="person__who">
        <Avatar person={p} size={44} />
        <span className="min0">
          <span className="person__name">{p.display_name || `@${p.handle}`}</span>
          <span className="person__handle">{why}</span>
        </span>
      </Link>
      <FollowButton person={p} small />
    </li>
  );
}

// Your shows: ours ids of shows you hooked, or logged an episode of, with a name for each.
function myShows(state) {
  const names = new Map();
  for (const s of Object.values(state?.shows || {})) if (s.showRef) names.set(s.showRef, s.title || "");
  for (const l of state?.logs || []) if (l.showRef && !names.has(l.showRef)) names.set(l.showRef, l.feedTitle || "");
  return names;
}

export default function DiscoverPeople() {
  const state = useStore();
  const me = state?.user?.id || null;
  const ready = !!state;
  // Who to leave out: you, and the people you followed when the page opened.
  const [hide, setHide] = useState(null);
  useEffect(() => {
    if (ready && !hide) setHide(new Set([me, ...(state.following || []).map((f) => f.id)].filter(Boolean)));
  }, [ready, me, hide, state]);

  const shows = useMemo(() => myShows(state), [state]);
  const showKey = [...shows.keys()].sort().join(",");

  const [fresh, setFresh] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [shownNew, setShownNew] = useState(NEW_PAGE);

  // New on Hooked on Pods.
  useEffect(() => {
    const db = supabase();
    if (!db) return;
    let live = true;
    db.from("profiles")
      .select(WHO)
      .not("handle", "is", null)
      .order("created_at", { ascending: false })
      .limit(NEW_MAX + 20)
      .then(({ data }) => live && setFresh(data || []));
    return () => {
      live = false;
    };
  }, []);

  // Suggested follows.
  useEffect(() => {
    const db = supabase();
    if (!db || !ready) return;
    let live = true;
    const ids = showKey ? showKey.split(",").slice(0, 100) : [];
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    Promise.all([
      ids.length
        ? db.from("logs").select("user_id, episodes!logs_episode_ref_fkey!inner(show_id)").in("episodes.show_id", ids).limit(1000)
        : Promise.resolve({ data: [] }),
      ids.length ? db.from("hooked_shows").select("user_id, show_ref").in("show_ref", ids).limit(1000) : Promise.resolve({ data: [] }),
      db.from("logs").select("user_id").not("hook", "is", null).neq("hook", "").gte("logged_at", since).order("logged_at", { ascending: false }).limit(1000),
    ]).then(async ([l, h, r]) => {
      // Shared shows per person.
      const shared = new Map();
      const add = (uid, sid) => {
        if (!uid || !sid) return;
        if (!shared.has(uid)) shared.set(uid, new Set());
        shared.get(uid).add(sid);
      };
      for (const x of l.data || []) add(x.user_id, x.episodes?.show_id);
      for (const x of h.data || []) add(x.user_id, x.show_ref);
      // Reviews this month per person.
      const reviews = new Map();
      for (const x of r.data || []) reviews.set(x.user_id, (reviews.get(x.user_id) || 0) + 1);

      const ranked = [...new Set([...shared.keys(), ...reviews.keys()])]
        .filter((uid) => uid !== me)
        .sort((a, b) => (shared.get(b)?.size || 0) - (shared.get(a)?.size || 0) || (reviews.get(b) || 0) - (reviews.get(a) || 0))
        .slice(0, 60);
      if (!ranked.length) return live && setSuggested([]);
      const { data: people } = await db.from("profiles").select(WHO).in("id", ranked).not("handle", "is", null);
      const byId = new Map((people || []).map((p) => [p.id, p]));
      const out = ranked
        .map((uid) => {
          const p = byId.get(uid);
          if (!p) return null;
          const same = [...(shared.get(uid) || [])];
          const n = reviews.get(uid) || 0;
          let why;
          if (same.length === 1 && shows.get(same[0])) why = `Also into ${shows.get(same[0])}`;
          else if (same.length) why = `Into ${same.length} of your shows`;
          else why = n === 1 ? "1 review this month" : `${n} reviews this month`;
          return { p, why };
        })
        .filter(Boolean);
      if (live) setSuggested(out);
    });
    return () => {
      live = false;
    };
    // `shows` changes with `showKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me, showKey]);

  if (!hide) return null;
  const keep = (p) => !hide.has(p.id);
  const picks = (suggested || []).filter((s) => keep(s.p)).slice(0, SUGGESTED);
  const pickIds = new Set(picks.map((s) => s.p.id));
  // Someone already suggested above isn't repeated under New.
  const newest = (fresh || []).filter((p) => keep(p) && !pickIds.has(p.id)).slice(0, NEW_MAX);

  return (
    <>
      {picks.length > 0 && (
        <section className="discover">
          <h2 className="label">Suggested follows</h2>
          <ul>
            {picks.map(({ p, why }) => (
              <DiscoverRow key={p.id} p={p} why={why} />
            ))}
          </ul>
        </section>
      )}
      {newest.length > 0 && (
        <section className="discover">
          <h2 className="label">New on Hooked on Pods</h2>
          <ul>
            {newest.slice(0, shownNew).map((p) => (
              <DiscoverRow key={p.id} p={p} why={joined(p.created_at)} />
            ))}
          </ul>
          {newest.length > shownNew && (
            <button className="btn btn--sm discover__more" onClick={() => setShownNew((n) => n + NEW_PAGE)}>
              Show more
            </button>
          )}
        </section>
      )}
    </>
  );
}
