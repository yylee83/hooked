import Link from "next/link";
import { notFound } from "next/navigation";
import Art from "@/components/Art";
import { PlayButton } from "@/components/Player";
import { QueueAll } from "@/components/Social";
import { getBrief } from "@/lib/briefs";
import { artOf, episodeCard, findEpisode, findShow, safe } from "@/lib/podcastindex";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { title: getBrief(slug)?.title || "Brief" };
}

// *word* in a dek becomes italic.
function Dek({ text }) {
  return text.split("*").map((part, i) => (i % 2 ? <em key={i}>{part}</em> : <span key={i}>{part}</span>));
}

export default async function BriefPage({ params }) {
  const { slug } = await params;
  const brief = getBrief(slug);
  if (!brief) notFound();

  const items = await Promise.all(
    brief.items.map(async (it) => {
      const { data: show } = await safe(findShow(it.show));
      const { data: ep } = show ? await safe(findEpisode(show.id, it.episode)) : { data: null };
      return { ...it, feed: show, ep: ep ? episodeCard(ep, show) : null };
    })
  );

  const queue = items.map((it) => ({
    episodeId: it.ep?.id,
    title: it.ep?.title || it.episode,
    feedId: it.feed?.id,
    feedTitle: it.feed?.title || it.show,
    image: it.ep?.image || artOf(it.feed),
    from: `${brief.title} brief`,
  }));

  const onCobalt = brief.color === "cobalt";

  return (
    <div className={`brief tone-${brief.color}`}>
      <div className="brief__top">
        <Link href="/briefs" className="back">
          ← Back
        </Link>
        <span className={`sticker ${onCobalt ? "" : "sticker--cobalt"}`}>Brief</span>
      </div>

      <h1 className="display h-xl">{brief.title}</h1>
      <p className="brief__dek">
        <Dek text={brief.dek} />
      </p>
      <p className="mono brief__meta">{brief.meta}</p>

      {items.map((it, i) => (
        <article key={it.episode} className="brief__item">
          <div className="brief__show">
            <div className="row gap center min0">
              <Art src={artOf(it.feed)} title={it.show || it.feed?.title} size={52} radius={12} />
              {it.feed ? (
                <Link href={`/show/${it.feed.id}`} className="muted" style={{ fontSize: 19 }}>
                  {brief.items[i].show}
                </Link>
              ) : (
                <span className="muted" style={{ fontSize: 19 }}>
                  {brief.items[i].show}
                </span>
              )}
            </div>
            <span className="brief__label">{it.label}</span>
          </div>
          <p className="brief__ep">{it.episode}</p>
          <span className={`pill ${i % 2 ? "pill--butter" : "pill--bubblegum"}`}>{it.angle}</span>
          {it.ep && (
            <div className="brief__actions">
              <PlayButton episode={it.ep} />
              <Link href={`/log/${it.ep.id}`} className="btn btn--sm btn--cobalt">
                Log it
              </Link>
            </div>
          )}
        </article>
      ))}

      <QueueAll items={queue} tone={brief.color} />
    </div>
  );
}
