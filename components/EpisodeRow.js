import Link from "next/link";
import Art from "./Art";
import { PlayButton } from "./Player";
import { minutes, shortDate } from "@/lib/format";

// One episode in a list: art, show, title, date and length, Play and Log it.
export default function EpisodeRow({ ep, showArt = true, desc }) {
  return (
    <li className="eps__row">
      <div className="row gap">
        {showArt && <Art src={ep.image} title={ep.feedTitle} size={64} radius={12} episodeId={ep.id} />}
        <div className="min0 grow">
          <p className="eps__meta">{[shortDate(ep.date), minutes(ep.duration)].filter(Boolean).join(" · ")}</p>
          <Link href={`/episode/${ep.id}`} className="eps__title" style={{ display: "block" }}>
            {ep.title}
          </Link>
          {showArt && ep.feedId && (
            <Link href={`/show/${ep.feedId}`} className="muted small" style={{ display: "block", marginBottom: 10 }}>
              {ep.feedTitle}
            </Link>
          )}
          {desc && <p className="eps__desc">{desc}</p>}
          <div className="row gap">
            <PlayButton episode={ep} />
            <Link href={`/log/${ep.id}`} className="btn btn--sm btn--cobalt">
              Log it
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}
