import Link from "next/link";
// Searching changes the page without reloading the site, so whatever is playing keeps playing (Erin, 2026-11-19).
import Form from "next/form";
import { briefs } from "@/lib/briefs";
import { SignInButton } from "@/components/Account";
import { BriefCard } from "@/components/BriefCards";
import { recentBriefs } from "@/lib/supabase/public";
import { searchBriefs } from "@/lib/search-community";
import { curatedSummary } from "@/lib/briefs-server";
import { minutes, plural } from "@/lib/format";
import { Suspense } from "react";

export const metadata = { title: "Lists" };

// Tile colours on this page (Erin, 2026-11-18): featured briefs are always pink, listener briefs always blue, whatever
// colour each brief has on its own page.
const FEATURED = "bubblegum";
const LISTENER = "cobalt";
// (The find page answers searches; plain /briefs is app/briefs/page.js.)

// Every card's one line of details, the same for built-in and listener briefs:
// shows · length · "Just the parts" (briefs that play clips) · who made it (@handle, or Hooked).
const briefMeta = ({ shows, seconds, mode, by }) =>
  [plural(shows, "show"), seconds ? minutes(seconds) : null, mode === "clips" ? "Just the parts" : null, by].filter(Boolean).join(" · ");
const listenerMeta = (b) =>
  briefMeta({ shows: b.shows ?? (b.items || []).length, seconds: b.seconds ?? b.total_seconds, mode: b.mode, by: b.author ? `@${b.author}` : null });

// Built-in briefs list shows and episodes by name: their covers, show count and length are worked out (and kept for a
// few hours) by curatedSummary. That can be slow when it isn't kept yet, so the page doesn't wait for it (below).
async function curatedCards() {
  const summaries = await Promise.all(briefs.map((b) => curatedSummary(b.slug).catch(() => null)));
  return Object.fromEntries(
    briefs.map((b, i) => {
      const s = summaries[i];
      return [b.slug, { covers: s?.covers || [], meta: briefMeta({ shows: s?.shows || b.items.length, seconds: s?.seconds, mode: b.mode, by: "Hooked" }) }];
    })
  );
}

function FeaturedRow({ curated = {} }) {
  return (
    <div className="selects" role="list">
      {briefs.map((b) => (
        <div key={b.slug} role="listitem" className="selects__item">
          <BriefCard variant="select" href={`/briefs/${b.slug}`} title={b.title} color={FEATURED} covers={curated[b.slug]?.covers} meta={curated[b.slug]?.meta} />
        </div>
      ))}
    </div>
  );
}

async function FeaturedRowLoaded() {
  return <FeaturedRow curated={await curatedCards()} />;
}

export default async function BriefsPage({ searchParams }) {
  const query = String((await searchParams)?.q || "").trim().slice(0, 100);

  const [community, found, curated] = await Promise.all([
    query ? [] : recentBriefs(40),
    query ? searchBriefs(query, 60) : null,
    query ? curatedCards() : {},
  ]);

  return (
    <>
      <div className="row center page-head">
        <h1 className="display h-lg cobalt">Lists</h1>
        <div className="row center page-head__actions">
          <SignInButton />
          <Link href="/briefs/new" className="btn btn--sm btn--cobalt btn--shadow-sm">
            + New list
          </Link>
        </div>
      </div>
      <p className="muted" style={{ margin: "8px 0 16px", fontSize: 19 }}>
        A topic, the best episodes and sections from several shows, and each show&rsquo;s angle.
      </p>

      {/* Searches briefs only (built-in and listeners'), by title, topic, description and the episodes inside. */}
      <Form className="search briefs-search" action="/briefs/find" role="search">
        <input className="input" type="search" name="q" defaultValue={query} placeholder="Search lists" aria-label="Search lists" />
        <button className="btn btn--cobalt btn--shadow-sm" type="submit">
          Search
        </button>
      </Form>

      {query ? (
        <section>
          <div className="row center" style={{ justifyContent: "space-between" }}>
            <h2 className="section-title">
              {found.total ? `${plural(found.total, "list")} for “${query}”` : `No lists match “${query}”`}
            </h2>
            <Link href="/briefs" className="more-link">
              Clear
            </Link>
          </div>
          {found.total === 0 && (
            <p className="muted">
              Try another word, or <Link href={`/briefs/new?topic=${encodeURIComponent(query)}`} className="more-link">make a list about it</Link>.
            </p>
          )}
          <div className="brief-grid">
            {found.briefs.map((b) => (
              <BriefCard
                key={b.href}
                href={b.href}
                title={b.title}
                color={b.slug ? FEATURED : LISTENER}
                covers={b.slug ? curated[b.slug]?.covers : b.covers}
                meta={b.slug ? curated[b.slug]?.meta : listenerMeta(b)}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          <h2 className="section-title">Featured lists</h2>
          {/* The cards show right away with their titles; covers and lengths fill in when they're worked out
              (YY, 2026-11-21: Briefs was slow to open while it waited for them). */}
          <Suspense fallback={<FeaturedRow />}>
            <FeaturedRowLoaded />
          </Suspense>

          {community.length > 0 && (
            <>
              <h2 className="section-title">Made by listeners</h2>
              <div className="brief-grid">
                {community.map((b) => (
                  <BriefCard
                    key={b.id}
                    href={`/briefs/b/${b.id}`}
                    title={b.title}
                    color={LISTENER}
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
