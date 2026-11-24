"use client";
// "Your reach" on your own profile (Erin, 2026-11-24): only you see it. Someone else's profile, or signed out: nothing,
// and my_reach isn't asked. See lib/my-reach.js and docs/superpowers/specs/2026-11-24-influence-stats-design.md.
import { useStore } from "@/lib/store";
import { useMyReach } from "@/lib/my-reach";

export default function YourReach({ ownerId }) {
  const state = useStore();
  const mine = !!state?.user && state.user.id === ownerId;
  const reach = useMyReach(mine ? ownerId : null);
  if (!mine || !reach) return null;
  const { people, added } = reach;
  return (
    <section className="reach" aria-label="Your reach">
      <p className="reach__label">
        <span className="mono">Your reach</span> <span className="reach__private">only you can see this</span>
      </p>
      {people === 0 && added === 0 ? (
        <p className="reach__empty">When someone adds an episode because of your review or send, it shows up here.</p>
      ) : (
        <>
          <p className="reach__row">
            <b className="reach__n">{people}</b> {people === 1 ? "person wants" : "people want"} to listen because of you
          </p>
          <p className="reach__row">
            <b className="reach__n">{added}</b> {added === 1 ? "episode" : "episodes"} added to Up next because of you
          </p>
        </>
      )}
    </section>
  );
}
