"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { supabase } from "@/lib/supabase/client";

// "Edit list" and "Delete list" for the person who made it. Deleting asks you to tap twice.
export default function BriefOwner({ authorId, briefId }) {
  const state = useStore();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!state?.user || state.user.id !== authorId) return null;

  async function remove() {
    if (!confirm) return setConfirm(true);
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase().from("briefs").delete().eq("id", briefId).select("id");
    if (err || !data?.length) {
      setBusy(false);
      setConfirm(false);
      setError("Couldn't delete. Try again.");
      return;
    }
    router.push("/me");
    router.refresh();
  }

  return (
    <>
      <div className="brief__owner">
        <Link href={`/briefs/b/${briefId}/edit`} className="btn btn--sm btn--shadow-sm">
          Edit brief
        </Link>
        <button type="button" className={`btn btn--sm btn--shadow-sm brief__delete ${confirm ? "is-confirm" : ""}`} onClick={remove} disabled={busy}>
          {busy ? "Deleting…" : confirm ? "Tap again to delete for good" : "Delete"}
        </button>
      </div>
      {error && <p className="nudge" style={{ marginTop: -12 }}>{error}</p>}
    </>
  );
}
