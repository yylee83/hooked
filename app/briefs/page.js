import Link from "next/link";
import { briefs } from "@/lib/briefs";
import { recentBriefs } from "@/lib/supabase/public";
import { artOf, findShow, safe } from "@/lib/podcastindex";
import { minutes } from "@/lib/format";

export const metadata = { title: "Briefs" };
export const revalidate = 60;

// The first few covers, fanned out at the top corner of a brief card. The first show sits on top.
function CoverFan({ covers }) {
  const list = covers.filter(Boolean).slice(0, 3);
  if (!list.length) return null;
  return (
    <span className="fan" aria-hidden="true">
      {list
        .map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" className={`fan__cover fan__cover--${i}`} loading="lazy" />
        ))
        .reverse()}
    </span>
  );
}

export default async function BriefsPage() {
  const [community, curatedCovers] = await Promise.all([
    recentBriefs(20),
    Promise.all(
      briefs.map((b) => Promise.all(b.items.slice(0, 3).map(async (it) => artOf((await safe(findShow(it.show))).data) || null)))
    ),
  ]);

  return (
    <>
      <div className="row center" style={{ justifyContent: "space-between" }}>
        <h1 className="display h-lg cobalt">Briefs</h1>
        <Link href="/briefs/new" className="btn btn--sm btn--cobalt btn--shadow-sm">
          + New brief
        </Link>
      </div>
      <p className="muted" style={{ margin: "8px 0 24px", fontSize: 19 }}>
        A topic, the best episodes and sections from several shows, and each show's angle.
      </p>
      {briefs.map((b, i) => (
        <Link key={b.slug} href={`/briefs/${b.slug}`} className={`brief-tile brief-tile--fan tone-${b.color}`}>
          <CoverFan covers={curatedCovers[i]} />
          <span className={`sticker ${b.color === "cobalt" ? "" : "sticker--cobalt"}`}>Brief</span>
          <h2 className="display">{b.title}</h2>
          <p style={{ fontSize: 18 }}>{b.dek.replace(/\*/g, "")}</p>
          <p className="mono small" style={{ marginTop: 14 }}>
            {b.meta}
          </p>
        </Link>
      ))}

      {community.length > 0 && (
        <>
          <h2 className="section-title">Made by listeners</h2>
          {community.map((b) => (
            <Link key={b.id} href={`/briefs/b/${b.id}`} className={`brief-tile brief-tile--sm brief-tile--fan tone-${b.color}`}>
              <CoverFan covers={(b.items || []).map((it) => it.image)} />
              <h2 className="display">{b.title}</h2>
              {b.dek && <p style={{ fontSize: 17 }}>{b.dek}</p>}
              <p className="mono small" style={{ marginTop: 12 }}>
                {[
                  `${b.items.length} shows`,
                  b.total_seconds ? minutes(b.total_seconds) : null,
                  b.mode === "clips" ? "Just the parts" : "Full episodes",
                  b.author?.handle ? `@${b.author.handle}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Link>
          ))}
        </>
      )}
    </>
  );
}
