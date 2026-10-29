import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import Art from "@/components/Art";
import Stars from "@/components/Stars";
import KeysNotice from "@/components/KeysNotice";
import { RecActions, Reactions } from "@/components/Social";
import { artOf, findEpisode, findShow, safe, trendingShows } from "@/lib/podcastindex";
import { listeningNow, recommendations } from "@/lib/demo";
import { AvatarLink, FreshLogs } from "@/components/Account";

// Refresh trending and friend data every 15 minutes.
export const revalidate = 900;

export default async function FriendsPage() {
  const trending = await safe(trendingShows(9));

  const friends = await Promise.all(
    listeningNow.map(async (f) => {
      const { data: show } = await safe(findShow(f.show));
      return { ...f, feed: show };
    })
  );

  const recs = await Promise.all(
    recommendations.map(async (r) => {
      const { data: show } = await safe(findShow(r.show));
      const { data: ep } = show ? await safe(findEpisode(show.id, r.episode)) : { data: null };
      return { ...r, feed: show, ep };
    })
  );

  return (
    <>
      <header className="topbar">
        <Wordmark size={48} />
        <AvatarLink />
      </header>

      <KeysNotice error={trending.error} />

      <h2 className="section-title">Listening now</h2>
      <p className="preview-note">Preview · sample friends</p>
      <div className="np-row">
        {friends.map((f, i) => {
          const card = (
            <>
              <Art src={artOf(f.feed)} title={f.show} size={150} tilt={[-2, 1.5, -1][i % 3]} radius={22} />
              <p className="np__who">{f.friend}</p>
              <p className="np__show">{f.feed?.title || f.show}</p>
            </>
          );
          return f.feed ? (
            <Link key={f.friend} href={`/show/${f.feed.id}`} className="np">
              {card}
            </Link>
          ) : (
            <div key={f.friend} className="np">
              {card}
            </div>
          );
        })}
      </div>

      <FreshLogs />

      <h2 className="section-title">Recommended to you</h2>
      {recs.map((r) => {
        const item = {
          episodeId: r.ep?.id,
          title: r.ep?.title || r.episode,
          feedId: r.feed?.id,
          feedTitle: r.feed?.title || r.show,
          image: r.ep?.image || r.ep?.feedImage || artOf(r.feed),
          from: r.friend,
        };
        const hasReactions = Object.values(r.reactions).some((n) => n > 0);
        return (
          <article key={r.episode} className="card rec">
            <div className="rec__head">
              <p>
                <b>{r.friend}</b> says you'd love this
              </p>
              <span className="sticker">Hooked</span>
            </div>
            <div className="rec__body">
              <Art src={item.image} title={item.feedTitle} size={96} radius={16} episodeId={item.episodeId} feedId={item.feedId} />
              <div className="min0">
                {item.episodeId ? (
                  <Link href={`/episode/${item.episodeId}`} className="rec__title">
                    {item.title}
                  </Link>
                ) : (
                  <p className="rec__title">{item.title}</p>
                )}
                <p className="muted row gap-xs center wrap" style={{ marginTop: 4 }}>
                  {item.feedId ? <Link href={`/show/${item.feedId}`}>{item.feedTitle}</Link> : item.feedTitle}
                  <span>·</span>
                  <Stars value={r.rating} size={20} />
                </p>
              </div>
            </div>
            <p className="rec__hook">“{r.hook}”</p>
            {hasReactions ? <Reactions counts={r.reactions} /> : <RecActions item={item} />}
          </article>
        );
      })}

      {trending.data?.length > 0 && (
        <>
          <h2 className="section-title">Trending right now</h2>
          <div className="trend">
            {trending.data.map((s, i) => (
              <Link key={s.id} href={`/show/${s.id}`} className="trend__item">
                <Art src={artOf(s)} title={s.title} size="100%" radius={18} tilt={[-1.5, 1, -0.5][i % 3]} className="art--fluid" />
                <p>{s.title}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
