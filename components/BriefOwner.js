"use client";
import Link from "next/link";
import { useStore } from "@/lib/store";

// "Edit brief" for the person who made it.
export default function BriefOwner({ authorId, briefId }) {
  const state = useStore();
  if (!state?.user || state.user.id !== authorId) return null;
  return (
    <div className="brief__owner">
      <Link href={`/briefs/b/${briefId}/edit`} className="btn btn--sm btn--shadow-sm">
        Edit brief
      </Link>
    </div>
  );
}
