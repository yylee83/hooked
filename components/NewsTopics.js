"use client";
// The chips and card of Search's "In the news, explained" (components/NewsExplained.js): a row of this week's topics,
// picked by news podcasts. Tapping one opens its card underneath, with an episode to catch up and older ones that go
// deeper; tapping it again closes it (YY, 2026-11-25: chips like the old trends bar, the card on tap).
import { useState } from "react";
import Link from "next/link";
import Art from "./Art";
import { PlayButton } from "./Player";
import { episodeHref } from "@/lib/addresses";
import { haptic } from "@/lib/haptics";

const YEAR = new Date().getFullYear();
const when = (ep, fresh) => {
  if (!ep.date) return "";
  const d = new Date(ep.date * 1000);
  if (fresh) return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
  return d.getFullYear() === YEAR ? d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" }) : String(d.getFullYear());
};

function NewsEp({ ep, fresh = false }) {
  return (
    <div className="news-x__ep">
      <Art src={ep.image} title={ep.feedTitle} size={48} radius={10} episodeRef={ep.ref} episodeId={ep.id} />
      <div className="min0 grow">
        <Link href={episodeHref(ep.ref, ep.id)} className="news-x__title">
          {ep.title}
        </Link>
        <p className="news-x__show">{[ep.feedTitle, when(ep, fresh)].filter(Boolean).join(" · ")}</p>
      </div>
      <PlayButton episode={ep} icon />
    </div>
  );
}

export default function NewsTopics({ topics }) {
  const [open, setOpen] = useState(null);
  const t = topics.find((x) => x.topic === open);
  return (
    <>
      <div className="news-x__chips" role="group" aria-label="This week's topics">
        {topics.map((x) => (
          <button
            key={x.topic}
            type="button"
            className={`news-x__chip ${x.topic === open ? "is-on" : ""}`}
            aria-expanded={x.topic === open}
            onClick={() => (haptic(), setOpen(x.topic === open ? null : x.topic))}
          >
            {x.topic}
          </button>
        ))}
      </div>
      {t && (
        <article className="news-x__card">
          <p className="news-x__kind mono">Catch up</p>
          <NewsEp ep={t.fresh} fresh />
          <p className="news-x__kind mono">Go deeper</p>
          {t.deeper.map((ep) => (
            <NewsEp key={ep.id} ep={ep} />
          ))}
          <Link href={`/search/find?${new URLSearchParams({ q: t.topic, type: "episodes" })}`} className="more-link news-x__more">
            More on {t.topic} →
          </Link>
        </article>
      )}
    </>
  );
}
