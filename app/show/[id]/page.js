import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Art from "@/components/Art";
import KeysNotice from "@/components/KeysNotice";
import { PlayButton } from "@/components/Player";
import { HookShowButton, LogButton, QueueButton } from "@/components/Social";
import { artOf, episodeCard, getEpisodes, plainText, safe } from "@/lib/podcastindex";
import { REF, loadShow, ownShowEpisodes, showRefFor, withRefs } from "@/lib/catalog";
import { episodeHref, withQuery } from "@/lib/addresses";
import { minutes, plural, shortDate } from "@/lib/format";
import ShowRatings from "@/components/ShowRatings";
import { showStats } from "@/lib/supabase/public";

const PAGE = 30; // episodes per "Load more"
const MOST = 1000; // Podcast Index returns at most 1,000 episodes per show

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { data } = await loadShow(id);
  return { title: data?.title || "Show" };
}

export default async function ShowPage({ params, searchParams }) {
  const { id } = await params;
  const query = (await searchParams) || {};
  const { note } = query;
  // Old addresses use Podcast Index's number: send them to our short one (/show/k3x9q2ab).
  if (/^\d{1,15}$/.test(id)) {
    const ref = (await showRefFor(id)) || (await loadShow(id)).data?.ref;
    if (ref) redirect(withQuery(`/show/${ref}`, query));
  } else if (!REF.test(id)) notFound();

  // Our own copy first, Podcast Index as backup (lib/catalog.js).
  const show = await loadShow(id);
  if (show.error) return <KeysNotice error={show.error} />;
  if (!show.data) notFound();
  const s = show.data;

  // Shows read from their own feed (or Spotify-only ones) list the episodes we saved; others ask
  // Podcast Index, falling back to ours if it has nothing. ?max= grows by 30 with each "Load more";
  // asking for one extra tells us whether there are more to show.
  const max = Math.min(MOST, Math.max(PAGE, parseInt(query.max) || PAGE));
  const fromPi = s.id && s.source !== "feed" && s.source !== "spotify";
  const [eps, community] = await Promise.all([fromPi ? safe(getEpisodes(s.id, max + 1)) : { data: [] }, showStats({ ref: s.ref, feedId: s.id })]);
  let raws = eps.data || [];
  if (!raws.length && s.ref) raws = await ownShowEpisodes(s.ref, max + 1);
  const more = raws.length > max && max < MOST;
  raws = raws.slice(0, max);
  const cards = await withRefs(raws.map((e) => episodeCard(e, s)));
  const episodes = raws.map((e, i) => ({ raw: e, card: cards[i] }));
  const categories = Object.values(s.categories || {}).slice(0, 2);

  return (
    <>
      <Link href="/search" className="back">
        ← Back
      </Link>
      {note && (
        <div className="notice" style={{ marginTop: 12 }}>
          <p>{String(note).slice(0, 160)}</p>
        </div>
      )}

      <div className="show__hero">
        <Art src={artOf(s)} title={s.title} size={150} tilt={-2.5} radius={24} className="art--shadow" />
      </div>
      <h1 className="display show__title" data-from={show.from}>{s.title}</h1>
      <p className="muted" style={{ fontSize: 19, marginTop: 6 }}>
        {s.author || s.ownerName}
      </p>
      <p className="mono small" style={{ marginTop: 10 }}>
        {[s.episodeCount ? plural(s.episodeCount, "episode") : null, ...categories].filter(Boolean).join(" · ")}
      </p>
      {s.description && <p className="show__desc">{plainText(s.description)}</p>}

      <ShowRatings show={{ showRef: s.ref, feedId: s.id }} community={community} />
      <HookShowButton show={{ feedId: s.id ?? undefined, showRef: s.ref, title: s.title, image: artOf(s) }} />
      {s.source === "spotify" && s.link && (
        <a href={s.link} className="btn btn--sm btn--shadow-sm" target="_blank" rel="noopener noreferrer" style={{ marginTop: 12 }}>
          Open in Spotify
        </a>
      )}

      <h2 className="section-title">Latest episodes</h2>
      {fromPi && <KeysNotice error={eps.error} />}
      {episodes.length === 0 && !eps.error && <p className="muted">No episodes found for this show yet.</p>}
      <ul>
        {episodes.map(({ raw, card }) => (
          <li key={card.ref || card.id} className="eps__row">
            <p className="eps__meta">{[shortDate(card.date), minutes(card.duration)].filter(Boolean).join(" · ")}</p>
            <Link href={episodeHref(card.ref, card.id)} className="eps__title" style={{ display: "block" }}>
              {card.title}
            </Link>
            {raw.description && <p className="eps__desc">{plainText(raw.description)}</p>}
            <div className="row gap">
              <PlayButton episode={card} />
              <LogButton episode={card} />
              <QueueButton episode={card} />
            </div>
          </li>
        ))}
      </ul>
      {more && (
        <Link href={withQuery(`/show/${id}`, { ...query, note: undefined, max: String(max + PAGE) })} className="btn btn--shadow-sm load-more" scroll={false}>
          Load more episodes
        </Link>
      )}
    </>
  );
}
