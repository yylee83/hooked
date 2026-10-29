import Wordmark from "@/components/Wordmark";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/me";
  return (
    <>
      <Wordmark size={48} />
      <h1 className="display h-lg" style={{ margin: "34px 0 10px" }}>
        Make your profile.
      </h1>
      <p className="muted" style={{ fontSize: 19, marginBottom: 18 }}>
        Save your log, pin the shows you're hooked on, and make briefs.
      </p>
      <LoginForm next={next} linkError={sp.error === "link"} />
    </>
  );
}
