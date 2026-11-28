import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Art from "@/components/Art";
import KeysNotice from "@/components/KeysNotice";
import { PlayButton } from "@/components/Player";
import BackButton from "@/components/BackButton";
import { HideLoggedControl, ShowEpisodeRow, SortLink } from "@/components/ShowEpisodes";
import { HookShowButton, LogButton, QueueButton } from "@/components/Social";
import { artOf, episodeCard, getEpisodes, plainText, safe } from "@/lib/podcastindex";
import { REF, loadShow, ownShowEpisodes, showRefFor, withRefs } from "@/lib/catalog";
import { episodeHref, withQuery } from "@/lib/addresses";
import { minutes, plural, shortDate } from "@/lib/format";
import ShowRatings from "@/components/ShowRatings";
import { showStats } from "@/lib/supabase/public";
import JsonLd from "@/components/JsonLd";
import { showData } from "@/lib/structured-data";
import { webLink } from "@/lib/safe-path";

const PAGE = 30; // episodes per "Load more"
const MOST = 1000; // Podcast Index returns at most 1,000 episodes per show

export async function generateMetadata({ params }) {
  const { id } = await params;
  const { data } = await loadShow(id);
  if (!data) return { title: "Show" };
  const notes = plainText(data.description || "");
  const about = notes.length > 150 ? `${notes.slice(0, 149).trimEnd()}…` : notes;
  const description = `${about ? `${about} ` : ""}Episode ratings and reviews on Hooked.`.trim();
  const image = artOf(data);
  return {
    title: `${data.title}: episodes, ratings and reviews`,
    description,
    ...(data.ref ? { alternates: { canonical: `/show/${data.ref}` } } : {}),
    openGraph: { title: data.title, description, ...(image ? { images: [{ url: image, alt: data.title }] } : {}) },
    twitter: { card: "summary", title: data.title, description, ...(image ? { images: [image] } : {}) },
  };
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
  // ?sort=oldest (Erin, 2026-11-27, like Apple): the lists only come newest first, so fetch the whole list (up to the
  // 1,000 Podcast Index gives) and flip it.
  const max = Math.min(MOST, Math.max(PAGE, parseInt(query.max) || PAGE));
  const oldest = query.sort === "oldest";
  const want = oldest ? MOST : max + 1;
  const fromPi = s.id && s.source !== "feed" && s.source !== "spotify";
  const [eps, community] = await Promise.all([fromPi ? safe(getEpisodes(s.id, want, true)) : { data: [] }, showStats({ ref: s.ref, feedId: s.id })]);
  let raws = eps.data || [];
  if (!raws.length && s.ref) raws = await ownShowEpisodes(s.ref, want);
  const capped = oldest && raws.length >= MOST; // more than 1,000: "oldest" is the oldest of the latest 1,000
  if (oldest) raws = [...raws].reverse();
  const more = raws.length > max && max < MOST;
  raws = raws.slice(0, max);
  const sortHref = (to) => withQuery(`/show/${id}`, { ...query, note: undefined, max: undefined, sort: to === "oldest" ? "oldest" : undefined });
  const cards = await withRefs(raws.map((e) => episodeCard(e, s)));
  const episodes = raws.map((e, i) => ({ raw: e, card: cards[i] }));
  const categories = Object.values(s.categories || {}).slice(0, 2);

  return (
    <>
      <BackButton fallback="/search" />
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
      <JsonLd data={showData({ show: s, path: `/show/${s.ref || s.id}`, image: artOf(s), stats: community })} />

      <ShowRatings show={{ showRef: s.ref, feedId: s.id }} community={community} />
      <HookShowButton show={{ feedId: s.id ?? undefined, showRef: s.ref, title: s.title, image: artOf(s) }} />
      {s.source === "spotify" && webLink(s.link) && (
        <a href={webLink(s.link)} className="btn btn--sm btn--shadow-sm" target="_blank" rel="noopener noreferrer" style={{ marginTop: 12 }}>
          Open in Spotify
        </a>
      )}

      <div className="show-eps__head">
        <h2 className="section-title">Episodes</h2>
        {episodes.length > 1 && (
          <SortLink href={sortHref(oldest ? "newest" : "oldest")} label={oldest ? "Sorted oldest first. Show newest first" : "Sorted newest first. Show oldest first"}>
            {oldest ? "Oldest ↑" : "Newest ↓"}
          </SortLink>
        )}
      </div>
      <HideLoggedControl episodes={episodes.map(({ card }) => ({ ref: card.ref, id: card.id }))} />
      {capped && <p className="muted small show-eps__note">Starts at the oldest of the 1,000 most recent episodes.</p>}
      {fromPi && <KeysNotice error={eps.error} />}
      {episodes.length === 0 && !eps.error && <p className="muted">No episodes found for this show yet.</p>}
      <ul>
        {episodes.map(({ raw, card }) => (
          <ShowEpisodeRow key={card.ref || card.id} episode={{ ref: card.ref, id: card.id }} className="eps__row">
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
          </ShowEpisodeRow>
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
