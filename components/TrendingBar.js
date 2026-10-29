import Link from "next/link";

// The "Trending now" strip: today's news topics.
// On Search, tapping a topic searches it. Elsewhere it opens the Trending page.
export default function TrendingBar({ topics, inSearch = false }) {
  if (!topics?.length) return null;
  const searchHref = (t) => `/search?${new URLSearchParams({ q: t.topic, type: "episodes" })}`;
  return (
    <section className={`trending ${inSearch ? "trending--search" : ""}`} aria-label="Trending now">
      <div className="trending__head">
        <span className="mono trending__label">
          <span className="trending__dot" aria-hidden="true" /> Trending now
        </span>
        <Link href="/trending" className="more-link" style={{ marginTop: 0 }}>
          See all →
        </Link>
      </div>
      <div className="trending__row">
        {topics.slice(0, 12).map((t, i) => (
          <Link key={t.topic} href={inSearch ? searchHref(t) : `/trending#t${i}`} className="trend-chip">
            <span className="trend-chip__topic">{t.topic}</span>
            {t.traffic && <span className="trend-chip__traffic mono">{t.traffic}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}
