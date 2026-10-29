"use client";
import { useState } from "react";
import EpisodeRow from "./EpisodeRow";

// Top-chart episodes on the Search tab. "Load more" adds the next 10 in place.
export default function TopEpisodes({ initial, next: firstNext }) {
  const [episodes, setEpisodes] = useState(initial);
  const [next, setNext] = useState(firstNext);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function loadMore() {
    setLoading(true);
    setFailed(false);
    try {
      let offset = next;
      let added = [];
      // Skip ahead if a page had no matches, so a click always adds something.
      while (offset !== null && added.length === 0) {
        const res = await fetch(`/api/top-episodes?offset=${offset}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const have = new Set([...episodes, ...added].map((e) => e.feedId));
        added = added.concat(data.episodes.filter((e) => !have.has(e.feedId)));
        offset = data.next;
      }
      setEpisodes((list) => list.concat(added));
      setNext(offset);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }

  return (
    <>
      <ul>
        {episodes.map((e) => (
          <EpisodeRow key={e.id} ep={e} desc={`#${e.rank} show on Apple Podcasts`} />
        ))}
      </ul>
      {failed && <p className="muted small">Couldn't load more just now. Try again.</p>}
      {next !== null && (
        <button className="btn btn--shadow-sm load-more" onClick={loadMore} disabled={loading}>
          {loading ? "Loading…" : "Load more episodes"}
        </button>
      )}
    </>
  );
}
