"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendLoginLink, sendPasswordReset, signInWithPassword, signUpWithPassword, useStore } from "@/lib/store";

// Sign in with a password (default), create an account, get a one-time link, or reset a password.
export default function LoginForm({ next = "/me", linkError, startMode = "signin" }) {
  const router = useRouter();
  const state = useStore();
  const [mode, setMode] = useState(startMode); // signin | signup | link | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null); // what we emailed: "link" | "confirm" | "reset"
  const [error, setError] = useState(linkError ? "That link expired or was already used. Sign in below, or get a new link." : "");

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
    const copy = {
      link: ["Check your email.", "We sent a sign-in link to"],
      confirm: ["Confirm your email.", "Almost there. We sent a confirmation link to"],
      reset: ["Check your email.", "We sent a link to set a new password to"],
    }[sent];
    return (
      <div className="card">
        <p className="display h-md" style={{ marginTop: 0 }}>{copy[0]}</p>
        <p style={{ fontSize: 19 }}>
          {copy[1]} <b>{email}</b>. Open it on this device.
        </p>
        <button className="link-btn small" style={{ marginTop: 14 }} onClick={() => (setSent(null), setMode("signin"))}>
          Back to sign in
        </button>
      </div>
    );
  }

  const switchTo = (m) => {
    setMode(m);
    setError("");
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const addr = email.trim();
    try {
      if (mode === "signin") {
        await signInWithPassword(addr, password);
        router.push(next);
      } else if (mode === "signup") {
        const ready = await signUpWithPassword(addr, password, next);
        if (ready) router.push(next);
        else setSent("confirm");
      } else if (mode === "forgot") {
        await sendPasswordReset(addr);
        setSent("reset");
      } else {
        await sendLoginLink(addr, next);
        setSent("link");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const needsPassword = mode === "signin" || mode === "signup";
  const cta = { signin: "Sign in", signup: "Create account", link: "Email me a link", forgot: "Send reset link" }[mode];

  return (
    <>
      {(mode === "signin" || mode === "signup") && (
        <div className="tabs auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "signin"} className={`tab ${mode === "signin" ? "is-on" : ""}`} onClick={() => switchTo("signin")}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} className={`tab ${mode === "signup" ? "is-on" : ""}`} onClick={() => switchTo("signup")}>
            Create account
          </button>
        </div>
      )}
      {mode === "forgot" && <p className="display h-md" style={{ margin: "18px 0 6px" }}>Forgot your password?</p>}
      {mode === "link" && <p className="display h-md" style={{ margin: "18px 0 6px" }}>Sign in with a link</p>}
      {(mode === "forgot" || mode === "link") && (
        <p className="muted" style={{ marginBottom: 6 }}>
          {mode === "forgot" ? "We'll email you a link to set a new one." : "No password needed. We'll email you a one-time link."}
        </p>
      )}

      <form onSubmit={submit} className="stack">
        <label className="label" htmlFor="email" style={{ margin: "10px 0 0" }}>
          Email
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

        {needsPassword && (
          <>
            <div className="row center" style={{ justifyContent: "space-between", marginTop: 16 }}>
              <label className="label" htmlFor="password" style={{ margin: 0 }}>
                Password
              </label>
              {mode === "signin" && (
                <button type="button" className="link-btn small" onClick={() => switchTo("forgot")}>
                  Forgot password?
                </button>
              )}
            </div>
            <div className="pw">
              <input
                id="password"
                className="input"
                type={show ? "text" : "password"}
                required
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className="pw__toggle" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </>
        )}

        <button className="btn btn--big btn--display btn--cobalt" style={{ marginTop: 22 }} disabled={busy || !state}>
          {busy ? "One sec…" : cta}
        </button>
        {error && <p className="nudge">{error}</p>}
      </form>

      <div className="auth-alt">
        {mode === "signin" && (
          <button type="button" className="link-btn small" onClick={() => switchTo("link")}>
            Email me a sign-in link instead
          </button>
        )}
        {mode === "signup" && <p className="muted small">Already have an account? Use the Sign in tab.</p>}
        {(mode === "forgot" || mode === "link") && (
          <button type="button" className="link-btn small" onClick={() => switchTo("signin")}>
            ← Back to sign in with a password
          </button>
        )}
      </div>
    </>
  );
}
