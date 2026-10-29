"use client";
import { useState } from "react";
import Link from "next/link";
import { sendLoginLink, useStore } from "@/lib/store";

export default function LoginForm({ next = "/me", linkError }) {
  const state = useStore();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError ? "That link expired or was already used. Send a new one." : "");

  if (state && !state.accounts) {
    return (
      <div className="notice">
        <p className="notice__title">Profiles aren't switched on yet.</p>
        <p>
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel → Settings →
          Environment Variables, then redeploy.
        </p>
      </div>
    );
  }

  if (state?.user) {
    return (
      <div className="card">
        <p className="display h-md" style={{ marginTop: 0 }}>You're signed in.</p>
        <Link href={next} className="btn btn--cobalt btn--shadow-sm">
          Keep going
        </Link>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="card">
        <p className="display h-md" style={{ marginTop: 0 }}>Check your email.</p>
        <p style={{ fontSize: 19 }}>
          We sent a sign-in link to <b>{email}</b>. Open it on this device and you're in.
        </p>
        <button className="link-btn small" style={{ marginTop: 14 }} onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await sendLoginLink(email.trim(), next);
      setSent(true);
    } catch (err) {
      setError(/rate|seconds/i.test(err.message) ? "Too many tries. Wait a minute, then send again." : "Couldn't send the link. Check the email and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="label" htmlFor="email" style={{ margin: "8px 0 0" }}>
        Your email
      </label>
      <input
        id="email"
        className="input"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn btn--big btn--display btn--cobalt" style={{ marginTop: 18 }} disabled={busy || !state}>
        {busy ? "Sending…" : "Send me a link"}
      </button>
      {error && <p className="nudge">{error}</p>}
      <p className="muted small">No password. New here? The same link makes your profile.</p>
    </form>
  );
}
