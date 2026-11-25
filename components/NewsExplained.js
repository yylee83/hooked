import NewsTopics from "./NewsTopics";
import { newsExplained } from "@/lib/news-explained";

// Search's "In the news, explained" (YY, 2026-11-25), in place of the Google Trends bar: chips of this week's topics,
// picked by news podcasts; tapping one opens a card with an episode to catch up and older ones that go deeper
// (components/NewsTopics.js, lib/news-explained.js). Hidden when nothing is strong enough.
export default async function NewsExplained() {
  const topics = await newsExplained();
  if (!topics.length) return null;
  return (
    <section className="news-x">
      <h2 className="label">In the news, explained</h2>
      <p className="muted small news-x__dek">This week&apos;s big stories. Tap one to catch up, then go deeper.</p>
      <NewsTopics topics={topics} />
    </section>
  );
}
