import Link from "next/link";
import EpisodeRow from "@/components/EpisodeRow";
import BackButton from "@/components/BackButton";
import { FollowTopicButton } from "@/components/FollowTopic";
import { episodeCard } from "@/lib/podcastindex";
import { withRefs } from "@/lib/catalog";
import { episodesAbout } from "@/lib/topic-alerts";

// Where a bundled "Follow topic" alert leads (YY, 2026-11-25): "9 new episodes about Jensen Huang" opens this list,
// the new episodes about the topic between `since` and `until` (unix seconds), found the same way the alert was.
export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }) {
  const { q } = await searchParams;
  return { title: q ? `New episodes about ${q}` : "New episodes" };
}

const day = (s) => new Date(s * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

// The time window from the link (never past now; three days if the link doesn't say).
function windowOf(sp) {
  const now = Date.now() / 1000;
  const until = Math.min(Number(sp.until) || now, now);
  return { until, since: Number(sp.since) || until - 3 * 86400 };
}

// "Nov 25", "Nov 23–25", "Nov 30–Dec 1"
function range(since, until) {
  const [a, b] = [day(since), day(until)];
  if (a === b) return b;
  return a.split(" ")[0] === b.split(" ")[0] ? `${a}–${b.split(" ")[1]}` : `${a}–${b}`;
}

export default async function TopicEpisodes({ searchParams }) {
  const sp = await searchParams;
  const topic = String(sp.q || "").trim().slice(0, 80);
  const { since, until } = windowOf(sp);
  const eps = topic ? await withRefs((await episodesAbout(topic, since, until)).map((e) => episodeCard(e))) : [];

  return (
    <>
      <BackButton fallback="/notifications" />
      <h1 className="display h-md cobalt topic-eps__title">New episodes about {topic || "…"}</h1>
      <p className="muted small topic-eps__when">
        {range(since, until)}
      </p>
      {topic && (
        <div className="topic-eps__follow">
          <FollowTopicButton topic={topic} showNote={false} />
        </div>
      )}
      {eps.length ? (
        <ul>
          {eps.map((ep) => (
            <EpisodeRow key={ep.id} ep={ep} />
          ))}
        </ul>
      ) : (
        <p className="muted">Nothing new here right now.</p>
      )}
      {topic && (
        <p className="topic-eps__more">
          <Link href={`/search/find?${new URLSearchParams({ q: topic, type: "episodes" })}`} className="mono small">
            All episodes about {topic} →
          </Link>
        </p>
      )}
    </>
  );
}
