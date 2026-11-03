"use client";
// On a show page: your take (from the episodes you logged) next to everyone's on Hooked.
import Stars from "./Stars";
import { sameShow, useStore } from "@/lib/store";
import { plural } from "@/lib/format";

// `show` is { showRef, feedId }: our show id, and the Podcast Index number when it has one.
export default function ShowRatings({ show, community }) {
  const state = useStore();
  const mine = (state?.logs || []).filter((l) => sameShow({ showRef: l.showRef, feedId: l.feedId }, show));
  const rated = mine.filter((l) => l.rating > 0);
  const myAvg = rated.length ? rated.reduce((a, l) => a + l.rating, 0) / rated.length : 0;
  if (!mine.length && !community) return null;
  return (
    <div className="show-ratings">
      {mine.length > 0 && (
        <div className="show-ratings__box">
          <p className="mono small">Your take</p>
          {myAvg > 0 ? (
            <p className="show-ratings__score">
              <Stars value={myAvg} size={16} /> <span className="mono">{myAvg.toFixed(1)}</span>
            </p>
          ) : (
            <p className="show-ratings__score muted">No stars yet</p>
          )}
          <p className="muted small">
            {plural(mine.length, "episode")} logged · hooked on {mine.filter((l) => l.hooked).length}
          </p>
        </div>
      )}
      {community && (
        <div className="show-ratings__box">
          <p className="mono small">On Hooked</p>
          {community.avg > 0 ? (
            <p className="show-ratings__score">
              <Stars value={community.avg} size={16} /> <span className="mono">{community.avg.toFixed(1)}</span>
            </p>
          ) : (
            <p className="show-ratings__score muted">No stars yet</p>
          )}
          <p className="muted small">
            {plural(community.listeners, "listener")} · {community.hookedPct}% hooked
          </p>
        </div>
      )}
    </div>
  );
}
