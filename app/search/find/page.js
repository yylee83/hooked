import Link from "next/link";
// Searching changes the page without reloading the site, so whatever is playing keeps playing (Erin, 2026-11-19).
import Form from "next/form";
import Art from "@/components/Art";
import EpisodeRow from "@/components/EpisodeRow";
import KeysNotice from "@/components/KeysNotice";
import { artOf, episodeCard, safe, searchEpisodes, searchShows } from "@/lib/podcastindex";
import { minutes as mins, plural } from "@/lib/format";
import SearchFilters from "@/components/SearchFilters";
import FriendsResults from "@/components/FriendsResults";
import { PersonRow } from "@/components/Friends";
import { searchBriefs, searchPeople } from "@/lib/search-community";
import ForYou from "@/components/ForYou";
import { isPodcastLink, linkTarget, resolveLink } from "@/lib/links";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppleCharts, PopularOnHooked, SectionLoading, Trending } from "@/components/SearchSections";
import { cookies } from "next/headers";
import { SignInButton } from "@/components/Account";
import { searchOwnShows, withRefs, withShowRefs } from "@/lib/catalog";
import SearchRecorder from "@/components/SearchRecorder";
import { showHref } from "@/lib/addresses";
import { namedShow, norm } from "@/lib/rank";
import { placeAppleEpisodes, placeAppleShows } from "@/lib/search";

export const metadata = { title: "Search" };

const PAGE = 20;

function ShowRow({ s }) {
  return (
    <li>
      <Link href={s.href || showHref(s.showRef, s.id)} prefetch={s.href ? false : undefined} className="results__row">
        <Art src={artOf(s)} title={s.title} size={68} radius={14} />
        <div className="min0">
          <p className="title-sm">{s.title}</p>
          <p className="muted small">{s.author || s.ownerName}</p>
          {s.episodeCount > 0 && <p className="mono small muted">{plural(s.episodeCount, "episode")}</p>}
        </div>
      </Link>
    </li>
  );
}

function href(q, type, max) {
  const p = new URLSearchParams({ q });
  if (type) p.set("type", type);
  if (max) p.set("max", String(max));
  return `/search?${p}`;
}

// Search with a query or a filter. Plain /search is app/search/page.js, made ahead of time; next.config.mjs sends
// /search?q=… and /search?type=… here, keeping the address.
export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  // Does this browser have a sign-in cookie? Only a hint (not checked with the database), so the Friends pill
  // can be drawn from the start instead of popping in once the browser has loaded your account.
  const signedInHint = (await cookies()).getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name) && c.value);
  const query = (sp.q || "").trim();
  const type = ["shows", "episodes", "friends", "people", "briefs"].includes(sp.type) ? sp.type : "all";
  const friends = type === "friends"; // searched in the browser, where we know who you follow (FriendsResults)
  // People and Briefs are sections in All (only when something matches), with "See all" views of their own.
  const community = type === "people" || type === "briefs";
  const max = Math.min(200, Math.max(PAGE, parseInt(sp.max) || PAGE));

  // Pasted an Apple Podcasts or Spotify link? Go straight to that episode's page (Play, Log it, + Up next).
  let linkError = null;
  if (query && isPodcastLink(query)) {
    const r = await resolveLink(query);
    const go = await linkTarget(r);
    if (go) redirect(go);
    linkError = r;
  }

  const wantPeople = query && !linkError && (type === "all" || type === "people");
  const wantBriefs = query && !linkError && (type === "all" || type === "briefs");
  const peoplePromise = wantPeople ? searchPeople(query, type === "people" ? 30 : 3) : null;
  const briefsPromise = wantBriefs ? searchBriefs(query, type === "briefs" ? 50 : 3) : null;
  let error = null;
  let episodes = [];
  let shows = [];

  if (linkError) {
    // fall through to the message below
  } else if (query && !friends && !community) {
    const [e, s] = await Promise.all([
      type === "shows" ? { data: [] } : safe(searchEpisodes(query, type === "episodes" ? max + 1 : 6)),
      type === "episodes" ? { data: [] } : safe(searchShows(query, type === "shows" ? max + 1 : 6)),
    ]);
    error = e.error || s.error;
    const [eps, piShows, own] = await Promise.all([
      placeAppleEpisodes(e.data || []).then((items) => withRefs(items.map((x) => episodeCard(x)))),
      placeAppleShows(s.data || []).then((list) => withShowRefs(list, "id")),
      type === "episodes" ? [] : searchOwnShows(query, 5),
    ]);
    episodes = eps;
    // Shows we read from their own feed (or Spotify) come first. A Podcast Index entry with the same
    // title is usually the broken copy that made us read the feed, so ours replaces it.
    const ownTitles = new Set(own.map((x) => norm(x.title)));
    const ownRefs = new Set(own.map((x) => x.ref));
    shows = [
      ...own.map((x) => ({ ...x, showRef: x.ref })),
      ...piShows.filter((x) => !(x.showRef && ownRefs.has(x.showRef)) && !ownTitles.has(norm(x.title))),
    ];
    // Ours first only when it's as good a match: an exact name further down beats a loose match of ours.
    const exactAt = shows.findIndex((x) => namedShow(query, x));
    if (exactAt > 0 && !namedShow(query, shows[0])) shows.unshift(...shows.splice(exactAt, 1));
  }
  const found = { people: [], exact: false, more: false, ...(await peoplePromise) };
  const foundBriefs = { briefs: [], total: 0, ...(await briefsPromise) };
  const moreEpisodes = type === "episodes" && episodes.length > max;
  const moreShows = type === "shows" && shows.length > max;
  if (type === "episodes") episodes = episodes.slice(0, max);
  if (type === "shows") shows = shows.slice(0, max);

  const peopleSection = found.people.length > 0 && (
    <section>
      <div className="row center" style={{ justifyContent: "space-between" }}>
        <h2 className="label">People</h2>
        {type === "all" && found.more && (
          <Link href={href(query, "people")} className="more-link">
            See all →
          </Link>
        )}
      </div>
      <ul className="people-list">
        {found.people.map((p) => (
          <PersonRow key={p.id} p={p} />
        ))}
      </ul>
    </section>
  );

  const briefsSection = foundBriefs.briefs.length > 0 && (
    <section>
      <div className="row center" style={{ justifyContent: "space-between" }}>
        <h2 className="label">Briefs</h2>
        {type === "all" && foundBriefs.total > foundBriefs.briefs.length && (
          <Link href={href(query, "briefs")} className="more-link">
            See all {foundBriefs.total} →
          </Link>
        )}
      </div>
      <ul>
        {foundBriefs.briefs.map((b) => (
          <li key={b.href}>
            <Link href={b.href} className="results__row">
              {b.image ? (
                <Art src={b.image} title={b.title} size={68} radius={14} />
              ) : (
                <span className={`search-brief-tile tone-${b.color}`} aria-hidden="true">
                  Brief
                </span>
              )}
              <div className="min0">
                <p className="title-sm">{b.title}</p>
                {b.dek && <p className="muted small brief-result__dek">{b.dek}</p>}
                <p className="mono small muted">
                  {b.meta ||
                    [plural(b.shows, "show"), b.seconds ? mins(b.seconds) : null, b.mode === "clips" ? "Just the parts" : null, b.author ? `@${b.author}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );

  const episodesSection = (
    <>
      {!error && !linkError && query && type !== "shows" && (
        <section>
          <div className="row center" style={{ justifyContent: "space-between" }}>
            <h2 className="label">Episodes</h2>
            {type === "all" && episodes.length > 5 && (
              <Link href={href(query, "episodes")} className="more-link">
                See all →
              </Link>
            )}
          </div>
          {episodes.length === 0 ? (
            <p className="muted">No episodes mention “{query}”.</p>
          ) : (
            <ul>
              {(type === "all" ? episodes.slice(0, 5) : episodes).map((ep) => (
                <EpisodeRow key={ep.ref || ep.id} ep={ep} />
              ))}
            </ul>
          )}
          {moreEpisodes && (
            <Link href={href(query, "episodes", max + PAGE)} className="btn btn--shadow-sm load-more" scroll={false}>
              Load more episodes
            </Link>
          )}
        </section>
      )}

    </>
  );
  const showsSection = (
    <>
      {/* Shows we saved ourselves still appear if Podcast Index is down. */}
      {(!error || shows.length > 0) && !linkError && query && type !== "episodes" && (
        <section>
          <div className="row center" style={{ justifyContent: "space-between" }}>
            <h2 className="label">Shows</h2>
            {type === "all" && shows.length > 5 && (
              <Link href={href(query, "shows")} className="more-link">
                See all →
              </Link>
            )}
          </div>
          {shows.length === 0 ? (
            <p className="muted">No shows match “{query}”.</p>
          ) : (
            <ul>
              {(type === "all" ? shows.slice(0, 5) : shows).map((s) => (
                <ShowRow key={s.showRef || s.id || `apple-${s.itunesId}`} s={s} />
              ))}
            </ul>
          )}
          {moreShows && (
            <Link href={href(query, "shows", max + PAGE)} className="btn btn--shadow-sm load-more" scroll={false}>
              Load more shows
            </Link>
          )}
        </section>
      )}
    </>
  );

  return (
    <>
      <div className="row center page-head">
        <h1 className="display h-lg cobalt">Search</h1>
        <SignInButton />
      </div>
      <p className="muted" style={{ marginTop: 6 }}>
        Find your next listen. Search a show, an episode, or anyone who's been a guest.
      </p>

      <Form id="search-form" className="search" action="/search" role="search">
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="People, shows, topics"
          aria-label="Search podcasts"
          autoFocus={!query}
        />
        <button className="btn btn--cobalt btn--shadow-sm" type="submit">
          Search
        </button>
      </Form>
      {/* Pasting a link still works; the placeholder was too long to show this on phones (YY, 2026-11-21). */}
      <p className="search-paste-hint muted small">
        Not finding it? Paste a Spotify or Apple Podcasts link to add it.
      </p>

      {/* Filters for the search, always right under the box so it's clear what they filter. */}
      <SearchFilters key={type} type={type} signedInHint={signedInHint} />

      {/* Trending topics and the lists below come in as they're ready, so the page itself opens at once
          (YY, 2026-11-21: Search was slow to open while all of them loaded first). */}
      <Suspense fallback={null}>
        <Trending />
      </Suspense>


      <KeysNotice error={error} />

      {linkError && (
        <div className="notice">
          <p>
            {linkError.error}{" "}
            {linkError.query && (
              <Link href={href(linkError.query, "episodes")} className="more-link">
                Search for “{linkError.query}” →
              </Link>
            )}
          </p>
        </div>
      )}

      {!query && (
        <Suspense fallback={<SectionLoading label="Popular on Hooked" />}>
          <PopularOnHooked />
        </Suspense>
      )}

      {!query && <ForYou compact />}

      {!query && (
        <Suspense fallback={null}>
          <AppleCharts />
        </Suspense>
      )}

      {query && !linkError && (
        <SearchRecorder query={query} filter={type} shows={shows.length} episodes={episodes.length} people={found.people.length} briefs={foundBriefs.briefs.length} />
      )}
      <div data-search-results>
        {friends && query && !linkError && <FriendsResults query={query} />}
        {type === "people" && (peopleSection || <p className="muted">No one on Hooked matches “{query}”.</p>)}
        {type === "briefs" && (briefsSection || <p className="muted">No briefs match “{query}”.</p>)}
        {/* All: someone's exact name goes first; partial name matches come after shows and episodes. */}
        {type === "all" && found.exact && peopleSection}
        {/* Always shows, then episodes, so the page looks the same for every search. */}
        {!friends && !community && showsSection}
        {!friends && !community && episodesSection}
        {type === "all" && !found.exact && peopleSection}
        {type === "all" && briefsSection}
      </div>
    </>
  );
}
