import Wordmark from "@/components/Wordmark";
import { safePath } from "@/lib/safe-path";

// Where the button in a sign-in, confirm or reset email lands (see the email templates in supabase/templates/). One tap
// signs in. It's a button rather than signing in on arrival because mail scanners open every link in an email, and
// would otherwise use up the one-time link before the person gets to it.
export const metadata = { title: "Sign in", robots: { index: false } };

function nextFrom(sp) {
  const ok = (p) => safePath(p, null) !== null;
  if (ok(sp.next)) return safePath(sp.next);
  // The templates pass along where the person was headed as redirect_to (…/auth/callback?next=/welcome/shows).
  try {
    const n = new URL(String(sp.redirect_to || "")).searchParams.get("next");
    if (ok(n)) return safePath(n);
  } catch {}
  return "/me";
}

export default async function ConfirmPage({ searchParams }) {
  const sp = await searchParams;
  const tokenHash = typeof sp.token_hash === "string" ? sp.token_hash : "";
  const type = typeof sp.type === "string" ? sp.type : "email";
  const recovery = type === "recovery";
  return (
    <>
      <Wordmark size={48} />
      <h1 className="display h-lg" style={{ margin: "34px 0 10px" }}>
        {recovery ? "Reset your password." : "You're nearly in."}
      </h1>
      <form method="post" action="/auth/callback" className="stack">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={nextFrom(sp)} />
        <button className="btn btn--big btn--display btn--cobalt" style={{ marginTop: 18 }} disabled={!tokenHash}>
          {recovery ? "Set a new password" : "Sign in to Hooked"}
        </button>
      </form>
    </>
  );
}
