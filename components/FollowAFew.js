"use client";
// The step right after someone picks their handle: follow a few people, then go Home.
import { useEffect, useState } from "react";
import Link from "next/link";
import DiscoverPeople from "./DiscoverPeople";
import { saveProfile, useStore } from "@/lib/store";

// New accounts get a handle automatically (from their name, or the start of their email). Change it right here.
function YourHandle({ profile }) {
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveProfile({ handle, displayName: profile.display_name || "" });
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p className="muted small follow-few__you">
        You're @{profile.handle}.{" "}
        <button className="link-btn small" onClick={() => (setHandle(profile.handle), setEditing(true))}>
          Change it
        </button>
      </p>
    );
  }
  return (
    <form className="follow-few__you row gap center" onSubmit={save}>
      <input className="input" style={{ flex: 1, minWidth: 0 }} value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" aria-label="Your handle" required autoFocus />
      <button className="btn btn--cobalt btn--sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      <button type="button" className="link-btn small" onClick={() => setEditing(false)}>Cancel</button>
      {error && <p className="nudge small" style={{ width: "100%", margin: 0 }}>{error}</p>}
    </form>
  );
}

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
      <h1 className="display h-lg cobalt">Follow a few people</h1>
      <p className="muted" style={{ margin: "8px 0 0", fontSize: 18 }}>
        Their reviews and picks fill your Home. You can change this anytime.
      </p>
      {state?.profile?.handle && <YourHandle profile={state.profile} />}
      <DiscoverPeople suggested={8} newPage={5} />
      <div className="follow-few__bar">
        <Link href="/" className="btn btn--display btn--cobalt btn--shadow-sm">
          {added ? `Done · ${added} followed` : "Skip for now"}
        </Link>
      </div>
    </div>
  );
}
