"use client";
// Step 2 of 3 after sign-up (after favorite shows): follow a few people, then two quick questions.
// Hooked is only useful for discovery once you follow people (YY, 2026-11-24), so the step sets a goal of 3: the big
// button waits for it ("Follow 3 more"), and Skip is a small link. Never more than there are people to follow.
// Everyone also follows Erin and YY, who make Hooked (YY, 2026-11-24), once per account on this device: unfollowing them
// later sticks. They don't count toward the 3.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DiscoverPeople from "./DiscoverPeople";
import { follow, useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

const GOAL = 3;
const TEAM = ["erin", "kikilululee"];

function useFollowTeam(state) {
  const me = state?.user?.id;
  const loaded = !!state?.following;
  useEffect(() => {
    const db = supabase();
    if (!db || !me || !loaded) return;
    const key = `hooked:team-followed:${me}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {}
    db.from("profiles")
      .select("id, handle, display_name")
      .in("handle", TEAM)
      .then(async ({ data }) => {
        for (const p of data || []) if (p.id !== me) await follow(p).catch(() => {});
        try {
          localStorage.setItem(key, "1");
        } catch {}
      });
  }, [me, loaded]);
}

export default function FollowAFew() {
  const state = useStore();
  useFollowTeam(state);
  const following = state?.following ?? null;
  // Who you followed on this page (not counting the Hooked team).
  const [start, setStart] = useState(null);
  useEffect(() => {
    if (start === null && following !== null) setStart(new Set(following.map((f) => f.id)));
  }, [start, following]);
  const added = start === null ? 0 : following.filter((f) => !start.has(f.id) && !TEAM.includes(f.handle)).length;
  const team = (following || []).filter((f) => TEAM.includes(f.handle));

  // How many people the page lists (null until loaded).
  const [listed, setListed] = useState(null);
  const onCount = useCallback((n) => setListed(n), []);
  const goal = listed === null ? GOAL : Math.min(GOAL, listed);
  const done = added >= goal;

  return (
    <div className="follow-few">
      <p className="mono small cobalt">Step 2 of 3</p>
      <h1 className="display h-lg cobalt">Follow {goal > 1 ? goal : "a few"} people</h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 18 }}>
        Hooked is better with friends: their reviews and picks fill your Home.
      </p>
      {team.length > 0 && (
        <p className="small muted follow-few__team">
          You&apos;re following {team.map((f) => `@${f.handle}`).join(" and ")}, who make Hooked on Pods.
        </p>
      )}
      <DiscoverPeople suggested={8} newPage={5} followAll onCount={onCount} exclude={TEAM} />
      <div className="follow-few__bar">
        {done ? (
          <span />
        ) : (
          <Link href="/welcome/about" className="follow-few__skip">
            Skip
          </Link>
        )}
        {goal > 0 && (
          <span className="follow-few__goal" aria-label={`${Math.min(added, goal)} of ${goal} followed`}>
            {Array.from({ length: goal }, (_, i) => (
              <i key={i} className={i < added ? "is-on" : ""} />
            ))}
          </span>
        )}
        {done || goal === 0 ? (
          <Link href="/welcome/about" className="btn btn--display btn--cobalt btn--shadow-sm">
            Next
          </Link>
        ) : (
          <span className="btn btn--display btn--cobalt btn--shadow-sm follow-few__wait" aria-disabled="true">
            Follow {goal - added} more
          </span>
        )}
      </div>
    </div>
  );
}
