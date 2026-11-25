import Link from "next/link";
import Art from "./Art";
import { PlayButton } from "./Player";
import { newsExplained } from "@/lib/news-explained";
import { episodeHref } from "@/lib/addresses";

// Search's "In the news, explained" (YY, 2026-11-25): a swipe row of the week's big stories, each with a fresh
// episode to catch up and one or two older ones that go deeper (lib/news-explained.js). Hidden when nothing is
// strong enough. In place of the Google Trends bar.
const YEAR = new Date().getFullYear();
const when = (ep, fresh) => {
  if (!ep.date) return "";
  const d = new Date(ep.date * 1000);
  if (fresh) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
  return d.getFullYear() === YEAR ? d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" }) : String(d.getFullYear());
};

function NewsEp({ ep, fresh = false }) {
  return (
    <div className="news-x__ep">
      <Art src={ep.image} title={ep.feedTitle} size={48} radius={10} episodeRef={ep.ref} episodeId={ep.id} />
      <div className="min0 grow">
        <Link href={episodeHref(ep.ref, ep.id)} className="news-x__title">
          {ep.title}
        </Link>
        <p className="news-x__show">{[ep.feedTitle, when(ep, fresh)].filter(Boolean).join(" · ")}</p>
      </div>
      <PlayButton episode={ep} icon />
    </div>
  );
}

export default async function NewsExplained() {
  const topics = await newsExplained();
  if (!topics.length) return null;
  return (
    <section className="news-x">
      <h2 className="label">In the news, explained</h2>
      <p className="muted small news-x__dek">This week&apos;s big stories. Catch up, then go deeper.</p>
      <div className="news-x__row">
        {topics.map((t) => (
          <article key={t.topic} className="news-x__card">
            <Link href={`/search/find?${new URLSearchParams({ q: t.topic, type: "episodes" })}`} className="news-x__topic">
              {t.topic}
            </Link>
            <p className="news-x__kind mono">Catch up</p>
            <NewsEp ep={t.fresh} fresh />
            <p className="news-x__kind mono">Go deeper</p>
            {t.deeper.map((ep) => (
              <NewsEp key={ep.id} ep={ep} />
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
