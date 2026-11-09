import Link from "next/link";
import { briefs } from "@/lib/briefs";
import { SignInButton } from "@/components/Account";
import { BriefCard } from "@/components/BriefCards";
import { recentBriefs } from "@/lib/supabase/public";
import { searchBriefs } from "@/lib/search-community";
import { curatedSummary } from "@/lib/briefs-server";
import { minutes, plural } from "@/lib/format";

export const metadata = { title: "Briefs" };
export const revalidate = 60;

// Every card's one line of details, the same for built-in and listener briefs:
// shows · length · "Just the parts" (briefs that play clips) · who made it (@handle, or Hooked).
const briefMeta = ({ shows, seconds, mode, by }) =>
  [plural(shows, "show"), seconds ? minutes(seconds) : null, mode === "clips" ? "Just the parts" : null, by].filter(Boolean).join(" · ");
const listenerMeta = (b) =>
  briefMeta({ shows: b.shows ?? (b.items || []).length, seconds: b.seconds ?? b.total_seconds, mode: b.mode, by: b.author ? `@${b.author}` : null });

export default async function BriefsPage({ searchParams }) {
  const query = String((await searchParams)?.q || "").trim().slice(0, 100);

  // Built-in briefs list shows and episodes by name: their covers, show count and length are worked out
  // (and kept for a few hours) by curatedSummary.
  const [community, summaries, found] = await Promise.all([
    query ? [] : recentBriefs(40),
    Promise.all(briefs.map((b) => curatedSummary(b.slug).catch(() => null))),
    query ? searchBriefs(query, 60) : null,
  ]);
  const curated = Object.fromEntries(
    briefs.map((b, i) => {
      const s = summaries[i];
      return [b.slug, { covers: s?.covers || [], meta: briefMeta({ shows: s?.shows || b.items.length, seconds: s?.seconds, mode: b.mode, by: "Hooked" }) }];
    })
  );

  return (
    <>
      <div className="row center page-head">
        <h1 className="display h-lg cobalt">Briefs</h1>
        <div className="row center page-head__actions">
          <SignInButton />
          <Link href="/briefs/new" className="btn btn--sm btn--cobalt btn--shadow-sm">
            + New brief
          </Link>
        </div>
      </div>
      <p className="muted" style={{ margin: "8px 0 16px", fontSize: 19 }}>
        A topic, the best episodes and sections from several shows, and each show&rsquo;s angle.
      </p>

      {/* Searches briefs only (built-in and listeners'), by title, topic, description and the episodes inside. */}
      <form className="search briefs-search" action="/briefs" role="search">
        <input className="input" type="search" name="q" defaultValue={query} placeholder="Search briefs" aria-label="Search briefs" />
        <button className="btn btn--cobalt btn--shadow-sm" type="submit">
          Search
        </button>
      </form>

      {query ? (
        <section>
          <div className="row center" style={{ justifyContent: "space-between" }}>
            <h2 className="section-title">
              {found.total ? `${plural(found.total, "brief")} for “${query}”` : `No briefs match “${query}”`}
            </h2>
            <Link href="/briefs" className="more-link">
              Clear
            </Link>
          </div>
          {found.total === 0 && (
            <p className="muted">
              Try another word, or <Link href={`/briefs/new?topic=${encodeURIComponent(query)}`} className="more-link">make a brief about it</Link>.
            </p>
          )}
          <div className="brief-grid">
            {found.briefs.map((b) => (
              <BriefCard
                key={b.href}
                href={b.href}
                title={b.title}
                color={b.color}
                covers={b.slug ? curated[b.slug]?.covers : b.covers}
                meta={b.slug ? curated[b.slug]?.meta : listenerMeta(b)}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          <h2 className="section-title">Hooked selects</h2>
          <div className="selects" role="list">
            {briefs.map((b) => (
              <div key={b.slug} role="listitem" className="selects__item">
                <BriefCard variant="select" href={`/briefs/${b.slug}`} title={b.title} color={b.color} covers={curated[b.slug].covers} meta={curated[b.slug].meta} />
              </div>
            ))}
          </div>

          {community.length > 0 && (
            <>
              <h2 className="section-title">Made by listeners</h2>
              <div className="brief-grid">
                {community.map((b) => (
                  <BriefCard
                    key={b.id}
                    href={`/briefs/b/${b.id}`}
                    title={b.title}
                    color={b.color}
                    covers={(b.items || []).map((it) => it.image)}
                    meta={listenerMeta({ ...b, author: b.author?.handle })}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
