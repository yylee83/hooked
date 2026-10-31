"use client";
// People: who someone follows, who follows them, and (on your own page) finding new people.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, FollowButton, PeopleFinder } from "./Friends";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

const WHO = "id, handle, display_name";

function PersonRow({ p, followBack }) {
  return (
    <li className="person">
      <Link href={`/u/${p.handle}`} className="person__who">
        <Avatar person={p} />
        <span className="min0">
          <span className="person__name">{p.display_name || `@${p.handle}`}</span>
          {p.display_name && <span className="person__handle">@{p.handle}</span>}
        </span>
      </Link>
      <FollowButton person={p} small label={followBack ? "Follow back" : undefined} />
    </li>
  );
}

// Load both lists for one person. Anyone can see who follows whom.
function usePeople(userId) {
  const [lists, setLists] = useState(null);
  useEffect(() => {
    const db = supabase();
    if (!db || !userId) return;
    let live = true;
    Promise.all([
      db.from("follows").select(`who:profiles!follows_followee_id_fkey(${WHO})`).eq("follower_id", userId).order("created_at", { ascending: false }),
      db.from("follows").select(`who:profiles!follows_follower_id_fkey(${WHO})`).eq("followee_id", userId).order("created_at", { ascending: false }),
    ]).then(([ing, ers]) => {
      if (!live) return;
      const clean = (r) => (r.data || []).map((x) => x.who).filter((w) => w && w.handle);
      setLists({ following: clean(ing), followers: clean(ers), error: ing.error || ers.error });
    });
    return () => {
      live = false;
    };
  }, [userId]);
  return lists;
}

// `person` is someone else's profile; leave it out for your own People page.
export default function PeopleTabs({ person = null, initialTab = "" }) {
  const state = useStore();
  const me = state?.user || null;
  const isMe = !person || person.id === me?.id;
  const subjectId = person?.id || me?.id || null;
  const lists = usePeople(subjectId);

  const tabs = [];
  if (subjectId) tabs.push(["following", "Following"], ["followers", "Followers"]);
  if (isMe) tabs.push(["find", "Find people"]);
  const fallback = tabs[0]?.[0] || "find";
  // Keep the tab that was asked for: until your account has loaded, only Find exists.
  const [tab, setTabState] = useState(initialTab);
  const current = tabs.some(([k]) => k === tab) ? tab : fallback;

  function setTab(k) {
    setTabState(k);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", k);
      window.history.replaceState(null, "", url);
    } catch {}
  }

  if (!state) return <div className="loading" aria-label="Loading" />;

  const followingIds = new Set((state.following || []).map((f) => f.id));
  const count = (k) => (lists && k !== "find" ? lists[k].length : null);
  const name = person ? person.display_name || `@${person.handle}` : null;

  return (
    <>
      {tabs.length > 1 && (
        <div className="tabs me-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} className={`tab ${current === k ? "is-on" : ""}`} role="tab" aria-selected={current === k} onClick={() => setTab(k)}>
              {label}
              {count(k) !== null && <span className="tab__n">{count(k)}</span>}
            </button>
          ))}
        </div>
      )}

      {current === "find" ? (
        <PeopleFinder />
      ) : !lists ? (
        <div className="loading" aria-label="Loading" />
      ) : lists.error ? (
        <p className="muted">Couldn't load this list. Try again in a moment.</p>
      ) : lists[current].length === 0 ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ margin: 0 }}>
            {current === "following"
              ? isMe
                ? "You're not following anyone yet. Follow people to see what they're hooked on."
                : `${name} isn't following anyone yet.`
              : isMe
                ? "No followers yet. Invite friends and they'll show up here."
                : `No one follows ${name} yet.`}
          </p>
          {isMe && (
            <button className="btn btn--cobalt btn--sm" style={{ marginTop: 12 }} onClick={() => setTab("find")}>
              Find people
            </button>
          )}
        </div>
      ) : (
        <ul>
          {lists[current].map((p) => (
            <PersonRow key={p.id} p={p} followBack={isMe && current === "followers" && !followingIds.has(p.id)} />
          ))}
        </ul>
      )}
    </>
  );
}
