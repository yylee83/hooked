"use client";
// The chips and card of Search's "In the news, explained" (components/NewsExplained.js): a row of this week's topics,
// picked by news podcasts. Tapping one opens its card underneath, with an episode to catch up and older ones that go
// deeper; tapping it again closes it (YY, 2026-11-25: chips like the old trends bar, the card on tap).
import { useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { PlayButton, PlayIcon, usePlayer } from "./Player";
import { episodeHref } from "@/lib/addresses";
import { haptic } from "@/lib/haptics";
import { addToList, useStore } from "@/lib/store";
import { useSignInFirst } from "@/lib/sign-in-first";
import { useStoryFollows } from "@/lib/story-follows";

const YEAR = new Date().getFullYear();
const when = (ep, fresh) => {
  if (!ep.date) return "";
  const d = new Date(ep.date * 1000);
  if (fresh) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
  return d.getFullYear() === YEAR ? d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" }) : String(d.getFullYear());
};

const upNextItem = (ep) => ({
  episodeId: ep.id,
  episodeRef: ep.ref,
  showRef: ep.showRef,
  title: ep.title,
  feedId: ep.feedId,
  feedTitle: ep.feedTitle,
  image: ep.image || ep.feedImage,
});

function NewsEp({ ep, fresh = false }) {
  return (
    <div className="news-x__ep">
      <Art src={ep.image} title={ep.feedTitle} size={48} radius={10} episodeRef={ep.ref} episodeId={ep.id} />
      <div className="min0 grow">
        <Link href={episodeHref(ep.ref, ep.id)} className="news-x__title">
          {ep.title}
        </Link>
        <p className="news-x__show">{[ep.feedTitle, when(ep, fresh)].filter(Boolean).join(" · ")}</p>
        {ep.why && <p className="news-x__why">{ep.why}</p>}
      </div>
      <PlayButton episode={ep} icon />
    </div>
  );
}

// The bottom of an open card: Play all (the catch-up now, the deeper ones next on Up next), Follow this story, and a
// search for more.
function CardActions({ t }) {
  const p = usePlayer();
  const state = useStore();
  const { guard } = useSignInFirst();
  const follows = useStoryFollows(state?.user?.id);
  const on = follows.following(t.key);
  const [queued, setQueued] = useState(false);
  const playAll = guard(async () => {
    haptic();
    p.play(t.fresh);
    for (const ep of [...t.deeper].reverse()) await addToList(upNextItem(ep), { first: true });
    setQueued(true);
  });
  return (
    <>
      <div className="news-x__acts">
        <button type="button" className="btn btn--sm btn--cobalt" onClick={playAll}>
          <PlayIcon size={13} /> Play all
        </button>
        <button type="button" className={`btn btn--sm ${on ? "btn--butter" : ""}`} aria-pressed={on} onClick={guard(() => (haptic(), follows.toggle(t.key, t.topic)))}>
          {on ? "✓ Following" : "Follow story"}
        </button>
      </div>
      {queued && <p className="news-x__note muted small">The deeper ones are next in Up next.</p>}
      {on && !queued && <p className="news-x__note muted small">We&apos;ll tell you when a news show covers it again.</p>}
      <Link href={`/search/find?${new URLSearchParams({ q: t.topic, type: "episodes" })}`} className="more-link news-x__more">
        More on {t.topic} →
      </Link>
    </>
  );
}

export default function NewsTopics({ topics }) {
  const [open, setOpen] = useState(null);
  const t = topics.find((x) => x.key === open);
  return (
    <>
      <div className="news-x__chips" role="group" aria-label="This week's stories">
        {topics.map((x) => (
          <button
            key={x.key}
            type="button"
            className={`news-x__chip ${x.key === open ? "is-on" : ""}`}
            aria-expanded={x.key === open}
            onClick={() => (haptic(), setOpen(x.key === open ? null : x.key))}
          >
            {x.topic}
          </button>
        ))}
      </div>
      {t && (
        <article className="news-x__card">
          {t.summary && <p className="news-x__summary">{t.summary}</p>}
          <p className="news-x__kind mono">Catch up</p>
          <NewsEp ep={t.fresh} fresh />
          <p className="news-x__kind mono">Go deeper</p>
          {t.deeper.map((ep) => (
            <NewsEp key={ep.ref || ep.id} ep={ep} />
          ))}
          <CardActions key={t.key} t={t} />
        </article>
      )}
    </>
  );
}
