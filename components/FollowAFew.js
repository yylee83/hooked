"use client";
// Step 2 of 3 after sign-up (after favorite shows): follow a few people, then two quick questions.
import { useEffect, useState } from "react";
import Link from "next/link";
import DiscoverPeople from "./DiscoverPeople";
import { useStore } from "@/lib/store";

export default function FollowAFew() {
  const state = useStore();
  const following = state?.following?.length ?? null;
  // How many you followed on this page.
  const [start, setStart] = useState(null);
  useEffect(() => {
    if (start === null && following !== null) setStart(following);
  }, [start, following]);
  const added = start === null ? 0 : Math.max(0, following - start);

  return (
    <div className="follow-few">
      <p className="mono small cobalt">Step 2 of 3</p>
      <h1 className="display h-lg cobalt">Follow a few people</h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 18 }}>
        Their reviews and picks fill your Home. You can change this anytime.
      </p>
      <DiscoverPeople suggested={8} newPage={5} />
      <div className="follow-few__bar">
        <Link href="/welcome/about" className="btn btn--display btn--cobalt btn--shadow-sm">
          {added ? `Next · ${added} followed` : "Skip for now"}
        </Link>
      </div>
    </div>
  );
}
