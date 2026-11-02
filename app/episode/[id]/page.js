import Link from "next/link";
import { notFound } from "next/navigation";
import Art from "@/components/Art";
import KeysNotice from "@/components/KeysNotice";
import { PlayButton } from "@/components/Player";
import { EpisodeLogs } from "@/components/Account";
import { ShareButton } from "@/components/Share";
import { QueueButton } from "@/components/Social";
import { JoinNudge } from "@/components/JoinNudge";
import LogThread from "@/components/LogThread";
import Stars from "@/components/Stars";
import { Avatar } from "@/components/Friends";
import { episodeCard, artOf } from "@/lib/podcastindex";
import { loadEpisode } from "@/lib/catalog";
import Notes from "@/components/Notes";
import { getSharedLog } from "@/lib/supabase/public";
import { minutes, shortDate } from "@/lib/format";
import { site } from "@/lib/site";

const cleanFrom = (v) => (typeof v === "string" && /^[a-z0-9._]{2,24}$/i.test(v) ? v.toLowerCase() : null);

export async function generateMetadata({ params, searchParams }) {
  const { id } = await params;
  const from = cleanFrom((await searchParams).from);
  const data = (await loadEpisode(id)).data?.episode;
  if (!data) return { title: "Episode" };
  const shared = from ? await getSharedLog(from, id) : null;
  const who = shared?.profile ? shared.profile.display_name || `@${shared.profile.handle}` : null;
  const title = who ? `${who} thinks you'd enjoy "${data.title}"` : data.title;
  const description = shared?.log?.hook ? `“${shared.log.hook}” Listen free on ${site.name}.` : `${data.feedTitle || "A podcast"} · Listen free on ${site.name}.`;
  const image = `/api/og/episode?${new URLSearchParams({ id, ...(shared?.profile ? { from: shared.profile.handle } : {}) })}`;
  return {
    title: data.title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function EpisodePage({ params, searchParams }) {
  const { id } = await params;
  const from = cleanFrom((await searchParams).from);
  if (!/^\d+$/.test(id)) notFound();

  // Our own copy first, Podcast Index as backup (lib/catalog.js).
  const ep = await loadEpisode(id);
  if (ep.error) return <KeysNotice error={ep.error} />;
  if (!ep.data) notFound();
  const { episode: e, show } = ep.data;
  const card = episodeCard(e, show);
  const shared = from ? await getSharedLog(from, card.id) : null;

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

      {shared?.profile && (
        <section className="shared-by">
          <div className="row gap center">
            <Avatar person={shared.profile} size={44} />
            <p className="min0">
              <Link href={`/u/${shared.profile.handle}`}>
                <b>{shared.profile.display_name || `@${shared.profile.handle}`}</b>
              </Link>{" "}
              thinks you'd enjoy this.
            </p>
          </div>
          {shared.log && (shared.log.rating > 0 || shared.log.hook || shared.log.hooked) && (
            <div className="shared-by__take">
              <div className="row gap-xs center wrap">
                {shared.log.hooked && <span className="sticker">Hooked</span>}
                {shared.log.rating > 0 && <Stars value={Number(shared.log.rating)} size={18} />}
              </div>
              {shared.log.hook && <p className="shared-by__hook">“{shared.log.hook}”</p>}
            </div>
          )}
          {shared.log && <LogThread logUserId={shared.profile.id} episodeId={card.id} defaultOpen id="thread" />}
        </section>
      )}

      <div className="ep-hero">
        <Art src={card.image} title={card.feedTitle} size={150} tilt={-2.5} radius={24} className="art--shadow" />
      </div>

      <p className="eps__meta">{[shortDate(card.date), minutes(card.duration)].filter(Boolean).join(" · ")}</p>
      <h1 className="display ep-title" data-from={ep.from}>{card.title}</h1>
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
        <QueueButton episode={card} />
        <ShareButton episode={card} />
      </div>

      {shared?.profile && <JoinNudge from={shared.profile.handle} />}

      <EpisodeLogs episodeId={card.id} />

      {e.description && (
        <section>
          <h2 className="label">Show notes</h2>
          <Notes text={e.description} />
        </section>
      )}
    </>
  );
}
