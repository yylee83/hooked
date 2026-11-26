"use client";
// Wrapped on its own page (/me/wrapped), opened from the slim line near the top of My log. It was a My log tab until
// Shows took its place (YY, 2026-11-26).
import BackButton from "./BackButton";
import Wrapped from "./Wrapped";
import { useStore } from "@/lib/store";

export default function WrappedPage() {
  const state = useStore();
  if (!state) return <div className="loading" aria-label="Loading" />;
  return (
    <>
      <BackButton fallback="/me" />
      <h1 className="display h-lg cobalt" style={{ marginTop: 10 }}>Wrapped</h1>
      <Wrapped logs={state.logs} hooked={state.shows} userId={state.user?.id || null} />
    </>
  );
}
