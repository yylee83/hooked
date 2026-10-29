import Link from "next/link";
import { notFound } from "next/navigation";
import Art from "@/components/Art";
import KeysNotice from "@/components/KeysNotice";
import { PlayButton } from "@/components/Player";
import { HookShowButton } from "@/components/Social";
import { artOf, episodeCard, getEpisodes, getShow, plainText, safe } from "@/lib/podcastindex";
import { minutes, plural, shortDate } from "@/lib/format";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { data } = await safe(getShow(id));
  return { title: data?.title || "Show" };
}

export default async function ShowPage({ params }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const show = await safe(getShow(id));
  if (show.error) return <KeysNotice error={show.error} />;
  if (!show.data) notFound();
  const s = show.data;

  const eps = await safe(getEpisodes(s.id, 30));
  const episodes = (eps.data || []).map((e) => ({ raw: e, card: episodeCard(e, s) }));
  const categories = Object.values(s.categories || {}).slice(0, 2);

  return (
    <>
      <Link href="/search" className="back">
        ← Back
      </Link>

      <div className="show__hero">
        <Art src={artOf(s)} title={s.title} size={150} tilt={-2.5} radius={24} className="art--shadow" />
      </div>
      <h1 className="display show__title">{s.title}</h1>
      <p className="muted" style={{ fontSize: 19, marginTop: 6 }}>
        {s.author || s.ownerName}
      </p>
      <p className="mono small" style={{ marginTop: 10 }}>
        {[s.episodeCount ? plural(s.episodeCount, "episode") : null, ...categories].filter(Boolean).join(" · ")}
      </p>
      {s.description && <p className="show__desc">{plainText(s.description)}</p>}

      <HookShowButton show={{ feedId: s.id, title: s.title, image: artOf(s) }} />

      <h2 className="section-title">Latest episodes</h2>
      <KeysNotice error={eps.error} />
      {episodes.length === 0 && !eps.error && <p className="muted">No episodes found for this show yet.</p>}
      <ul>
        {episodes.map(({ raw, card }) => (
          <li key={card.id} className="eps__row">
            <p className="eps__meta">{[shortDate(card.date), minutes(card.duration)].filter(Boolean).join(" · ")}</p>
            <Link href={`/log/${card.id}`} className="eps__title" style={{ display: "block" }}>
              {card.title}
            </Link>
            {raw.description && <p className="eps__desc">{plainText(raw.description)}</p>}
            <div className="row gap">
              <PlayButton episode={card} />
              <Link href={`/log/${card.id}`} className="btn btn--sm btn--cobalt">
                Log it
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
