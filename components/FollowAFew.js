"use client";
// Step 2 of 3 after sign-up (after favorite shows): follow a few people, then two quick questions.
// Hooked is only useful for discovery once you follow people (YY, 2026-11-24), so the step sets a goal of 3: the big
// button waits for it ("Follow 3 to continue"), and Skip is a small link. Never more than there are people to follow.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DiscoverPeople from "./DiscoverPeople";
import { useStore } from "@/lib/store";

const GOAL = 3;

export default function FollowAFew() {
  const state = useStore();
  const following = state?.following?.length ?? null;
  // How many you followed on this page.
  const [start, setStart] = useState(null);
  useEffect(() => {
    if (start === null && following !== null) setStart(following);
  }, [start, following]);
  const added = start === null ? 0 : Math.max(0, following - start);

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
      <DiscoverPeople suggested={8} newPage={5} followAll onCount={onCount} />
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
