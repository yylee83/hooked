import Link from "next/link";
import { notFound } from "next/navigation";
import Art from "@/components/Art";
import KeysNotice from "@/components/KeysNotice";
import { PlayButton } from "@/components/Player";
import { EpisodeLogs } from "@/components/Account";
import { episodeCard, getEpisode, getShow, safe, artOf } from "@/lib/podcastindex";
import { minutes, shortDate } from "@/lib/format";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { data } = await safe(getEpisode(id));
  return { title: data?.title || "Episode" };
}

// Keep paragraph breaks from the show notes, drop the HTML.
function notesToParagraphs(html = "") {
  return html
    .replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z]+;/g, " ")
    .split(/\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 30);
}

export default async function EpisodePage({ params }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const ep = await safe(getEpisode(id));
  if (ep.error) return <KeysNotice error={ep.error} />;
  if (!ep.data) notFound();
  const e = ep.data;
  const { data: show } = await safe(getShow(e.feedId));
  const card = episodeCard(e, show);

  return (
    <>
      {card.feedId ? (
        <Link href={`/show/${card.feedId}`} className="back">
          ← {card.feedTitle || "Show"}
        </Link>
      ) : (
        <Link href="/search" className="back">
          ← Search
        </Link>
      )}

      <div className="ep-hero">
        <Art src={card.image} title={card.feedTitle} size={150} tilt={-2.5} radius={24} className="art--shadow" />
      </div>

      <p className="eps__meta">{[shortDate(card.date), minutes(card.duration)].filter(Boolean).join(" · ")}</p>
      <h1 className="display ep-title">{card.title}</h1>
      {card.feedId && (
        <Link href={`/show/${card.feedId}`} className="ep-show">
          <Art src={artOf(show) || card.feedImage} title={card.feedTitle} size={36} radius={9} />
          <span>{card.feedTitle}</span>
        </Link>
      )}

      <div className="row gap wrap" style={{ margin: "20px 0 8px" }}>
        <PlayButton episode={card} />
        <Link href={`/log/${card.id}`} className="btn btn--sm btn--cobalt btn--shadow-sm">
          Log it
        </Link>
      </div>

      <EpisodeLogs episodeId={card.id} />

      {e.description && (
        <section>
          <h2 className="label">Show notes</h2>
          <div className="ep-notes">
            {notesToParagraphs(e.description).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
