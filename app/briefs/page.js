import Link from "next/link";
import { briefs } from "@/lib/briefs";
import { recentBriefs } from "@/lib/supabase/public";
import { minutes } from "@/lib/format";

export const metadata = { title: "Briefs" };
export const revalidate = 60;

export default async function BriefsPage() {
  const community = await recentBriefs(20);
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
      {briefs.map((b) => (
        <Link key={b.slug} href={`/briefs/${b.slug}`} className={`brief-tile tone-${b.color}`}>
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
            <Link key={b.id} href={`/briefs/b/${b.id}`} className={`brief-tile brief-tile--sm tone-${b.color}`}>
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
