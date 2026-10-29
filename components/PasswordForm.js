"use client";
import { useState } from "react";
import { setPassword } from "@/lib/store";

// Set or change your password while signed in.
export default function PasswordForm({ onDone, submitLabel = "Save password" }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (pw !== pw2) return setError("Those two passwords don't match.");
    setBusy(true);
    try {
      await setPassword(pw);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="pw">
        <input
          className="input"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder="New password (8+ characters)"
          minLength={8}
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <button type="button" className="pw__toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      <input
        className="input"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        placeholder="Type it again"
        required
        value={pw2}
        onChange={(e) => setPw2(e.target.value)}
      />
      {error && <p className="nudge">{error}</p>}
      <button className="btn btn--cobalt btn--shadow-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
