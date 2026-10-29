import Link from "next/link";
import { trendingTopics } from "@/lib/trends";

export const metadata = { title: "Trending now" };
export const revalidate = 1800;

export default async function TrendingPage() {
  const topics = await trendingTopics(25);
  return (
    <>
      <h1 className="display h-lg cobalt">Trending now</h1>
      <p className="muted" style={{ margin: "8px 0 22px", fontSize: 19 }}>
        {topics[0]?.source === "wikipedia" ? "What people are reading about most today." : "What the US is searching for today, from Google Trends."} Tap one to hear what podcasts are saying, or make it a brief.
      </p>

      {topics.length === 0 && <p className="muted">Trending topics aren't loading right now. Check back in a bit.</p>}

      <ol className="trend-list">
        {topics.map((t, i) => {
          const headline = t.news[0];
          return (
            <li key={t.topic} id={`t${i}`} className="trend-item">
              <div className="row gap center" style={{ justifyContent: "space-between" }}>
                <span className="mono trend-item__rank">{String(i + 1).padStart(2, "0")}</span>
                {t.traffic && <span className="mono small muted">{t.source === "wikipedia" ? t.traffic : `${t.traffic} searches`}</span>}
              </div>
              <h2 className="display trend-item__topic">{t.topic}</h2>
              {headline && (
                <a href={headline.url} target="_blank" rel="noopener noreferrer" className="trend-item__news">
                  {headline.title}
                  {headline.source && <span className="muted"> · {headline.source}</span>}
                </a>
              )}
              <div className="row gap wrap" style={{ marginTop: 14 }}>
                <Link href={`/search?${new URLSearchParams({ q: t.topic, type: "episodes" })}`} className="btn btn--sm btn--cobalt">
                  Hear about it
                </Link>
                <Link href={`/briefs/new?${new URLSearchParams({ topic: t.topic })}`} className="btn btn--sm">
                  Make a brief
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
