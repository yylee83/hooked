import Link from "next/link";
import Art from "./Art";
import { ClipChip, PlayButton, PlayCut } from "./Player";
import { QueueAll } from "./Social";
import { briefQueue, briefSeconds, clipSeconds, clock } from "@/lib/clips";
import { minutes } from "@/lib/format";

// *word* in a dek becomes italic.
function Dek({ text = "" }) {
  return text.split("*").map((part, i) => (i % 2 ? <em key={i}>{part}</em> : <span key={i}>{part}</span>));
}

// One page for every brief, hand-made or made with the + button.
export default function BriefView({ brief, items, backHref = "/briefs" }) {
  const mode = brief.mode || "clips";
  const usable = items.filter((it) => it.found !== false);
  const segs = briefQueue(usable, mode);
  const total = briefSeconds(usable, mode);
  const anyClips = mode === "clips" && usable.some((it) => it.clips?.length && !it.clips[0].whole);
  const onCobalt = brief.color === "cobalt";

  const meta =
    brief.meta ||
    [`${usable.length} shows`, total ? `About ${minutes(total)}` : null, mode === "clips" ? `Just the parts on ${brief.topic}` : "Full episodes"]
      .filter(Boolean)
      .join(" · ");

  const queue = usable.map((it) => ({
    episodeId: it.episodeId,
    title: it.episode,
    feedId: it.feedId,
    feedTitle: it.show,
    image: it.image,
    from: `${brief.title} brief`,
  }));

  return (
    <div className={`brief tone-${brief.color || "cobalt"}`}>
      <div className="brief__top">
        <Link href={backHref} className="back">
          ← Back
        </Link>
        <span className={`sticker ${onCobalt ? "" : "sticker--cobalt"}`}>Brief</span>
      </div>

      <h1 className="display h-xl">{brief.title}</h1>
      {brief.dek && (
        <p className="brief__dek">
          <Dek text={brief.dek} />
        </p>
      )}
      <p className="mono brief__meta">{meta}</p>
      {brief.author && <p className="brief__by">Made by @{brief.author}</p>}

      {segs.length > 0 && (
        <div className="cut">
          <PlayCut
            segs={segs}
            title={brief.title}
            tone={brief.color}
            label={anyClips ? `Play the cut · ${clock(total)}` : `Play all · ${minutes(total) || `${segs.length} episodes`}`}
          />
          {anyClips && (
            <p className="cut__note">
              {segs.length} clips, back to back, straight from each show's feed.
            </p>
          )}
        </div>
      )}

      {items.map((it, i) => {
        const clips = mode === "clips" ? it.clips || [] : [];
        const partial = clips.length > 0 && !clips[0].whole;
        const label = partial
          ? `${clips.length} ${clips.length === 1 ? "CLIP" : "CLIPS"} · ${clock(clipSeconds(clips))}`
          : it.label || "FULL EPISODE";
        const ep = {
          id: it.episodeId,
          title: it.episode,
          feedId: it.feedId,
          feedTitle: it.show,
          image: it.image,
          audio: it.audio,
          duration: it.duration,
        };
        return (
          <article key={`${it.episodeId || it.episode}-${i}`} className="brief__item">
            <div className="brief__show">
              <div className="row gap center min0">
                <Art src={it.image} title={it.show} size={52} radius={12} />
                {it.feedId ? (
                  <Link href={`/show/${it.feedId}`} className="muted" style={{ fontSize: 19 }}>
                    {it.show}
                  </Link>
                ) : (
                  <span className="muted" style={{ fontSize: 19 }}>
                    {it.show}
                  </span>
                )}
              </div>
              <span className="brief__label">{label}</span>
            </div>
            <p className="brief__ep">{it.episode}</p>
            {it.angle && <span className={`pill ${i % 2 ? "pill--butter" : "pill--bubblegum"}`}>{it.angle}</span>}

            {partial && (
              <>
                {clips[0].quote && <p className="clip-quote">“…{clips[0].quote}…”</p>}
                <div className="row gap-xs wrap" style={{ marginTop: 10 }}>
                  {clips.map((c) => (
                    <ClipChip key={c.start} seg={{ ep, start: c.start, end: c.end }} title={brief.title} label={`${clock(c.start)}–${clock(c.end)}`} />
                  ))}
                </div>
              </>
            )}
            {mode === "clips" && !partial && it.found !== false && it.transcript && it.transcript !== "timed" && (
              <p className="muted small" style={{ marginTop: 10 }}>
                No timed transcript published for this one, so it plays in full.
              </p>
            )}
            {it.found === false && (
              <p className="muted small" style={{ marginTop: 10 }}>
                Couldn't find this episode in Podcast Index yet.
              </p>
            )}

            {it.episodeId && it.found !== false && (
              <div className="brief__actions">
                <PlayButton episode={ep} />
                <Link href={`/log/${it.episodeId}`} className="btn btn--sm btn--cobalt">
                  Log it
                </Link>
              </div>
            )}
          </article>
        );
      })}

      <QueueAll items={queue} tone={brief.color} />
    </div>
  );
}
