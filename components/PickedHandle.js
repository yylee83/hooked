"use client";
// One time only, for the few people who signed up before handles were required: Hooked picked one for them
// (migration 20261122180000_auto_handles.sql). They can keep it or change it; either way the note goes away.
import { useState } from "react";
import { saveProfile, settleHandle, useStore } from "@/lib/store";

export default function PickedHandle() {
  const state = useStore();
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const profile = state?.profile;
  if (!state?.user || !profile?.handle_auto || !profile.handle) return null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveProfile({ handle, displayName: profile.display_name || "" });
      await settleHandle();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card picked-handle">
      {editing ? (
        <form className="row gap center" onSubmit={save}>
          <input className="input picked-handle__input" value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" aria-label="Your handle" required autoFocus />
          <button className="btn btn--cobalt btn--sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="link-btn small" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <>
          <p style={{ margin: 0 }}>
            We picked <b>@{profile.handle}</b> for you, so friends can find and follow you.
          </p>
          <div className="row gap center" style={{ marginTop: 10 }}>
            <button className="btn btn--cobalt btn--sm" onClick={settleHandle}>Keep it</button>
            <button className="btn btn--sm" onClick={() => (setHandle(profile.handle), setEditing(true))}>Change it</button>
          </div>
        </>
      )}
      {error && <p className="nudge small" style={{ margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
