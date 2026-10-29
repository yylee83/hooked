"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import PasswordForm from "@/components/PasswordForm";
import { useStore } from "@/lib/store";

// Where the "Forgot password?" email lands, already signed in for this one step.
export default function ResetPasswordPage() {
  const router = useRouter();
  const state = useStore();
  const [done, setDone] = useState(false);

  return (
    <>
      <Wordmark size={48} />
      <h1 className="display h-lg" style={{ margin: "34px 0 16px" }}>
        Set a new password.
      </h1>
      {!state ? (
        <div className="loading" />
      ) : done ? (
        <div className="card">
          <p className="display h-md" style={{ marginTop: 0 }}>Saved.</p>
          <p style={{ marginBottom: 16 }}>Next time, sign in with your email and this password.</p>
          <button className="btn btn--cobalt btn--shadow-sm" onClick={() => router.push("/me")}>
            Go to My log
          </button>
        </div>
      ) : state.user ? (
        <PasswordForm onDone={() => setDone(true)} />
      ) : (
        <div className="card">
          <p style={{ marginBottom: 16 }}>This reset link has expired or was already used. Ask for a fresh one.</p>
          <Link href="/login" className="btn btn--cobalt btn--shadow-sm">
            Back to sign in
          </Link>
        </div>
      )}
    </>
  );
}
