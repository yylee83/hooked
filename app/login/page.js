import { safePath } from "@/lib/safe-path";
import Wordmark from "@/components/Wordmark";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = safePath(sp.next);
  const startMode = sp.mode === "signup" ? "signup" : sp.mode === "waitlist" ? "waitlist" : "signin";
  const startEmail = typeof sp.email === "string" && sp.email.length <= 254 ? sp.email : "";
  return (
    <>
      <Wordmark size={48} />
      <h1 className="display h-lg" style={{ margin: "34px 0 10px" }}>
        {{ signin: "Welcome back.", signup: "Make your profile.", waitlist: "Join Hooked." }[startMode]}
      </h1>
      <p className="muted" style={{ fontSize: 19, marginBottom: 8 }}>
        Save your log, pin the shows you're hooked on, and make lists.
      </p>
      <LoginForm next={next} linkError={sp.error === "link" || sp.error === "device" ? sp.error : ""} startMode={startMode} startEmail={startEmail} />
    </>
  );
}
