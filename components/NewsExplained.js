import NewsTopics from "./NewsTopics";
import { newsExplained } from "@/lib/news-explained";

// Search's "In the news, explained" (YY, 2026-11-25), in place of the Google Trends bar: chips of this week's stories,
// picked by news podcasts, with the week's dates; tapping one opens a card with an episode to catch up, older ones that
// go deeper, Play all and Follow story (components/NewsTopics.js, lib/news-explained.js). Hidden when nothing is
// strong enough.
const day = (t, opts) => new Date(t * 1000).toLocaleDateString("en-US", { timeZone: "America/New_York", ...opts });

// "Nov 19–25", or "Nov 28 – Dec 4" across months.
function weekLabel(since, until) {
  since += 86400; // a 7-day window, counted in whole days
  const a = day(since, { month: "short" });
  const b = day(until, { month: "short" });
  return a === b ? `${a} ${day(since, { day: "numeric" })}–${day(until, { day: "numeric" })}` : `${a} ${day(since, { day: "numeric" })} – ${b} ${day(until, { day: "numeric" })}`;
}

export default async function NewsExplained() {
  const { since, builtAt, topics } = await newsExplained();
  if (!topics.length) return null;
  return (
    <section className="news-x">
      <div className="news-x__head">
        <h2 className="label">In the news, explained</h2>
        <span className="news-x__week mono">{weekLabel(since, builtAt)}</span>
      </div>
      <p className="muted small news-x__dek">This week&apos;s big stories, according to news podcasts. Tap one to catch up, then go deeper.</p>
      <NewsTopics topics={topics} />
    </section>
  );
}
