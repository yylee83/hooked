"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { forgetInvite, rememberInvite, savedInvite } from "@/lib/invites";
import { joinWaitlist, resendConfirmation, sendLoginLink, sendPasswordReset, signInWithPassword, signUpWithPassword, useStore, verifyEmailCode } from "@/lib/store";

// Sign in with a password (default), create an account, get a one-time link, or reset a password.
// invite: the code of an invite link (/i/<code>); signing up with it works without being on the invite list. A link
// opened earlier on this device counts too.
const LINK_ERRORS = {
  link: "That link didn't work. It may have expired or been used already. Get a new one below, or sign in with your password.",
  // Opened in a different browser or app from the one that asked for it (often the phone's mail app).
  device:
    "That link was opened in a different browser from the one you asked from. If you were confirming a new account, you're confirmed: sign in with your password. Otherwise, get a new link below.",
};

export default function LoginForm({ next = "/me", linkError, startMode = "signin", startEmail = "", invite = "" }) {
  const router = useRouter();
  const state = useStore();
  const [mode, setMode] = useState(startMode); // signin | signup | link | forgot | waitlist
  const [email, setEmail] = useState(startEmail);
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [over13, setOver13] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null); // what we emailed: "link" | "confirm" | "reset", or "waitlist"
  const [code, setCode] = useState(invite);
  const [otp, setOtp] = useState(""); // the 6-digit code from the email
  const [resent, setResent] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  useEffect(() => {
    if (invite) rememberInvite(invite);
    else setCode(savedInvite());
  }, [invite]);
  const [error, setError] = useState(LINK_ERRORS[linkError] || (linkError ? LINK_ERRORS.link : ""));

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

  // After a sign-up, the link in the email leads to the first welcome step.
  const firstStep = next === "/me" ? "/welcome/shows" : next;

  async function sendAgain() {
    setBusy(true);
    setError("");
    const addr = email.trim();
    try {
      if (sent === "confirm" || unconfirmed) await resendConfirmation(addr, firstStep);
      else if (sent === "reset") await sendPasswordReset(addr);
      else await sendLoginLink(addr, next);
      setResent(true);
      if (unconfirmed) setSent("confirm");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verifyEmailCode(email.trim(), otp, sent);
      router.push(sent === "reset" ? "/reset-password" : sent === "confirm" ? firstStep : next);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (sent) {
    const copy = {
      link: ["Check your email.", "We sent a sign-in link to"],
      confirm: ["Confirm your email.", "Almost there. We sent a confirmation email to"],
      reset: ["Check your email.", "We sent a link to set a new password to"],
      waitlist: ["You're on the list.", "We'll email"],
    }[sent];
    return (
      <div className="card">
        <p className="display h-md" style={{ marginTop: 0 }}>{copy[0]}</p>
        <p style={{ fontSize: 19 }}>
          {copy[1]} <b>{email}</b>
          {sent === "waitlist" ? " when there's room. Keep exploring Hooked in the meantime." : ". Not there? Check your spam folder."}
        </p>
        {sent === "waitlist" ? (
          <Link href="/" className="btn btn--cobalt btn--shadow-sm" style={{ marginTop: 14 }}>
            Explore Hooked
          </Link>
        ) : (
          <>
            <form onSubmit={submitCode} className="login-code">
              <label className="label" htmlFor="otp" style={{ margin: "6px 0 0" }}>
                Or type the code from the email
              </label>
              <div className="login-code__row">
                <input
                  id="otp"
                  className="input login-code__input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={12}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                <button className="btn btn--cobalt" disabled={busy || otp.replace(/\D/g, "").length < 6}>
                  {busy ? "One sec…" : "Go"}
                </button>
              </div>
            </form>
            {error && <p className="nudge" role="alert">{error}</p>}
            <p className="muted small" style={{ marginTop: 14 }}>
              {resent ? "Sent again. Use the newest email: older links and codes stop working. " : "Didn't get it? "}
              <button type="button" className="link-btn small" onClick={sendAgain} disabled={busy}>
                Send it again
              </button>
            </p>
            <button
              className="link-btn small"
              style={{ marginTop: 6 }}
              onClick={() => (setSent(null), setResent(false), setOtp(""), setError(""), setMode("signin"))}
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    );
  }

  const switchTo = (m) => {
    setMode(m);
    setError("");
    setUnconfirmed(false);
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setUnconfirmed(false);
    const addr = email.trim();
    try {
      if (mode === "signin") {
        await signInWithPassword(addr, password).catch((err) => {
          if (/confirm your email/i.test(err.message)) setUnconfirmed(true);
          throw err;
        });
        router.push(next);
      } else if (mode === "signup") {
        // A new account starts with three short, skippable steps (favorite shows, follow people, two questions).
        if (!over13) throw new Error("You need to be 13 or older to use Hooked.");
        const ready = await signUpWithPassword(addr, password, firstStep, handle, name, code);
        forgetInvite();
        if (ready) router.push(firstStep);
        else setSent("confirm");
      } else if (mode === "waitlist") {
        await joinWaitlist(addr);
        setSent("waitlist");
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
  const cta = { signin: "Sign in", signup: "Create account", link: "Email me a link", forgot: "Send reset link", waitlist: "Join the waitlist" }[mode];
  const notInvited = mode === "signup" && /invite-only|waitlist/.test(error);

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
      {mode === "signup" && !code && (
        <p className="muted" style={{ margin: "14px 0 0" }}>
          Hooked is invite-only for now. Use the email you were invited with.
        </p>
      )}
      {mode === "waitlist" && (
        <>
          <p className="display h-md" style={{ margin: "18px 0 6px" }}>Join the waitlist</p>
          <p className="muted" style={{ marginBottom: 6 }}>We're letting people in a few at a time. We'll email you when there's room.</p>
        </>
      )}
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

        {mode === "signup" && (
          <>
            <label className="label" htmlFor="handle" style={{ margin: "16px 0 0" }}>
              Handle
            </label>
            <input
              id="handle"
              className="input"
              required
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              placeholder="e.g. maya.k"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
            <p className="muted small" style={{ margin: 0 }}>How friends find and follow you. You can change it later.</p>

            <label className="label" htmlFor="name" style={{ margin: "16px 0 0" }}>
              Name <span className="muted small signup-optional">optional</span>
            </label>
            <input
              id="name"
              className="input"
              autoComplete="name"
              autoCapitalize="words"
              maxLength={60}
              placeholder="What friends call you"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </>
        )}

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

        {mode === "signup" && (
          <label className="signup-age">
            <input type="checkbox" required checked={over13} onChange={(e) => setOver13(e.target.checked)} />
            <span>I'm 13 or older</span>
          </label>
        )}

        <button className="btn btn--big btn--display btn--cobalt" style={{ marginTop: 22 }} disabled={busy || !state}>
          {busy ? "One sec…" : cta}
        </button>
        {error && <p className="nudge" role="alert">{error}</p>}
        {unconfirmed && (
          <button type="button" className="btn" onClick={sendAgain} disabled={busy}>
            Send the confirmation email again
          </button>
        )}
        {notInvited && (
          <button type="button" className="btn" onClick={() => switchTo("waitlist")}>
            Join the waitlist instead
          </button>
        )}
      </form>

      <div className="auth-alt">
        {mode === "signin" && (
          <button type="button" className="link-btn small" onClick={() => switchTo("link")}>
            Email me a sign-in link instead
          </button>
        )}
        {mode === "signup" && !code && (
          <p className="muted small">
            Not invited yet?{" "}
            <button type="button" className="link-btn small" onClick={() => switchTo("waitlist")}>
              Join the waitlist
            </button>
          </p>
        )}
        {mode === "waitlist" && (
          <button type="button" className="link-btn small" onClick={() => switchTo("signup")}>
            ← Back to create account
          </button>
        )}
        {(mode === "forgot" || mode === "link") && (
          <button type="button" className="link-btn small" onClick={() => switchTo("signin")}>
            ← Back to sign in with a password
          </button>
        )}
      </div>
    </>
  );
}
