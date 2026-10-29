"use client";
// On a show page: your take (from the episodes you logged) next to everyone's on Hooked on.
import Stars from "./Stars";
import { useStore } from "@/lib/store";
import { plural } from "@/lib/format";

export default function ShowRatings({ feedId, community }) {
  const state = useStore();
  const mine = (state?.logs || []).filter((l) => String(l.feedId) === String(feedId));
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
          <p className="mono small">On Hooked on</p>
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
