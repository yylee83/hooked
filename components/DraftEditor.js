"use client";
// A draft brief's edit page. The server reads briefs without your sign-in, so it can't see drafts: this loads the
// draft in the browser, where only its author can read it, then opens the brief builder.
import { useEffect, useState } from "react";
import Link from "next/link";
import BriefBuilder, { editingFrom } from "./BriefBuilder";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

export default function DraftEditor({ id }) {
  const state = useStore();
  const userId = state?.user?.id;
  const [brief, setBrief] = useState(undefined); // undefined while loading, null if it isn't yours or doesn't exist

  useEffect(() => {
    if (!state?.ready || !userId) return;
    let live = true;
    supabase()
      .from("briefs")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => live && setBrief(data && data.author_id === userId ? data : null));
    return () => {
      live = false;
    };
  }, [id, userId, state?.ready]);

  if (state?.ready && !userId)
    return (
      <p className="muted" style={{ marginTop: 40 }}>
        <Link href={`/login?next=/briefs/b/${id}/edit`} className="u-link">Sign in</Link> to open this draft.
      </p>
    );
  if (brief === undefined) return <p className="muted" style={{ marginTop: 40 }}>Loading your draft…</p>;
  if (!brief)
    return (
      <p className="muted" style={{ marginTop: 40 }}>
        We couldn’t find that brief. <Link href="/briefs" className="u-link">See all briefs</Link>
      </p>
    );
  return <BriefBuilder editing={editingFrom(brief)} />;
}
