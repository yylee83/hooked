import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import LoginForm from "@/components/LoginForm";
import { publicDb } from "@/lib/supabase/public";

// An invite link: hookedonpods.com/i/<code>. Shows who sent it and the Create account form.
// Signing up from here works without being on the invite list (hook_invite_gate checks the code).

async function inviteInfo(code) {
  const c = String(code || "").toLowerCase();
  const db = publicDb();
  if (!db || !/^[a-z0-9]{6,16}$/.test(c)) return null;
  const { data } = await db.rpc("invite_info", { p_code: c });
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { code: c, handle: row.handle, name: row.display_name, open: !!row.open } : null;
}

function who(inv) {
  return inv?.name || (inv?.handle ? `@${inv.handle}` : "A friend");
}

export async function generateMetadata({ params }) {
  const { code } = await params;
  const inv = await inviteInfo(code);
  const title = inv?.open ? `${who(inv)} invited you to Hooked on Pods` : "Join Hooked on Pods";
  return { title: { absolute: title }, description: "Log the podcasts you love, see what friends are hooked on.", robots: { index: false } };
}

export default async function InvitePage({ params }) {
  const { code } = await params;
  const inv = await inviteInfo(code);

  if (!inv?.open) {
    return (
      <>
        <Wordmark size={48} />
        <h1 className="display h-lg" style={{ margin: "34px 0 10px" }}>This invite link doesn&apos;t work anymore.</h1>
        <p className="muted" style={{ fontSize: 19, marginBottom: 18 }}>
          Ask {inv ? who(inv) : "your friend"} for a new one, or join the waitlist.
        </p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Link href="/login?mode=waitlist" className="btn btn--cobalt btn--shadow-sm">Join the waitlist</Link>
          <Link href="/" className="btn">Explore Hooked</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Wordmark size={48} />
      <h1 className="display h-lg" style={{ margin: "34px 0 10px" }}>{who(inv)} invited you.</h1>
      <p className="muted" style={{ fontSize: 19, marginBottom: 8 }}>
        Log the podcasts you love and see what friends are hooked on.
        {inv.handle ? ` You'll follow @${inv.handle} from the start.` : ""}
      </p>
      <p className="invite-beta">Hooked on Pods is in beta</p>
      <LoginForm startMode="signup" invite={inv.code} />
    </>
  );
}
