// Where the links in sign-in emails land. Two kinds:
// - ?code=… (Supabase's default link): only works in the browser that asked for the email, because that browser
//   holds the other half of the key. Opened anywhere else (the phone's mail app, another browser) it fails.
// - ?token_hash=… (our email templates, supabase/templates/): works on any device. A GET only shows a "Sign in"
//   button (/auth/confirm), and the POST from that button signs in. Mail scanners that open every link (Outlook,
//   work email) only do GETs, so they can't use up the link before the person taps it.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { safePath } from "@/lib/safe-path";

const TYPES = ["email", "signup", "magiclink", "recovery", "invite", "email_change"];


async function db() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash) {
    const to = new URL("/auth/confirm", url.origin);
    to.search = url.search;
    return NextResponse.redirect(to);
  }

  const code = url.searchParams.get("code");
  const next = safePath(url.searchParams.get("next"));
  if (code && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { error } = await (await db()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    // Opened in a different browser from the one that asked. A sign-up confirmation still counts (Supabase confirms
    // the email before sending the person here), so they can sign in with their password.
    if (error.code === "pkce_code_verifier_not_found" || /code verifier/i.test(error.message || "")) {
      return NextResponse.redirect(new URL("/login?error=device", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}

// The "Sign in" button on /auth/confirm.
export async function POST(request) {
  const url = new URL(request.url);
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") || "");
  const type = String(form.get("type") || "email");
  const recovery = type === "recovery";
  const next = recovery ? "/reset-password" : safePath(String(form.get("next") || ""));
  if (tokenHash && TYPES.includes(type) && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { error } = await (await db()).auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, url.origin), 303);
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin), 303);
}
