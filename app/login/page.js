import Wordmark from "@/components/Wordmark";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/me";
  const startMode = sp.mode === "signup" ? "signup" : "signin";
  return (
    <>
      <Wordmark size={48} />
      <h1 className="display h-lg" style={{ margin: "34px 0 10px" }}>
        {startMode === "signup" ? "Make your profile." : "Welcome back."}
      </h1>
      <p className="muted" style={{ fontSize: 19, marginBottom: 8 }}>
        Save your log, pin the shows you're hooked on, and make briefs.
      </p>
      <LoginForm next={next} linkError={sp.error === "link"} startMode={startMode} />
    </>
  );
}
