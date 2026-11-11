import Link from "next/link";
import Art from "@/components/Art";
import EpisodeRow from "@/components/EpisodeRow";
import KeysNotice from "@/components/KeysNotice";
import { artOf, episodeCard, safe, searchEpisodes, searchShows } from "@/lib/podcastindex";
import { minutes as mins, plural } from "@/lib/format";
import TrendingBar from "@/components/TrendingBar";
import TopEpisodes from "@/components/TopEpisodes";
import SearchFilters from "@/components/SearchFilters";
import FriendsResults from "@/components/FriendsResults";
import { PersonRow } from "@/components/Friends";
import { searchBriefs, searchPeople } from "@/lib/search-community";
import ForYou from "@/components/ForYou";
import { trendingTopics } from "@/lib/trends";
import { popularOnHooked, topChartEpisodes, topCharts } from "@/lib/charts";
import { isPodcastLink, linkTarget, resolveLink } from "@/lib/links";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SignInButton } from "@/components/Account";
import { searchOwnShows, withRefs, withShowRefs } from "@/lib/catalog";
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

  // Pasted an Apple Podcasts or Spotify link? Go straight to logging it.
  let linkError = null;
  if (query && isPodcastLink(query)) {
    const r = await resolveLink(query);
    const go = await linkTarget(r);
    if (go) redirect(go);
    linkError = r;
  }

  const topicsPromise = trendingTopics(12);
  const wantPeople = query && !linkError && (type === "all" || type === "people");
  const wantBriefs = query && !linkError && (type === "all" || type === "briefs");
  const peoplePromise = wantPeople ? searchPeople(query, type === "people" ? 30 : 3) : null;
  const briefsPromise = wantBriefs ? searchBriefs(query, type === "briefs" ? 50 : 3) : null;
  let error = null;
  let episodes = [];
  let shows = [];
  let topics = [];
  let popular = [];
  let chartEps = { episodes: [], next: null };
  let chart = [];

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
  } else {
    [popular, chartEps, chart] = await Promise.all([popularOnHooked(30, 15), topChartEpisodes(0, 10), topCharts(9)]);
  }

  topics = await topicsPromise;
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
        Find an episode or a show. Search a person to see everywhere they've been on.
      </p>

      <form id="search-form" className="search" action="/search" role="search">
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="People, shows, topics, or paste a link"
          aria-label="Search podcasts"
          autoFocus={!query}
        />
        <button className="btn btn--cobalt btn--shadow-sm" type="submit">
          Search
        </button>
      </form>

      {/* Filters for the search, always right under the box so it's clear what they filter. */}
      <SearchFilters key={type} type={type} signedInHint={signedInHint} />

      <TrendingBar topics={topics} inSearch />


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
        <>
          <h2 className="label">Popular on Hooked</h2>
          <p className="muted small" style={{ marginTop: -4, marginBottom: 8 }}>
            The shows people here logged most in the last 30 days.
          </p>
          {popular.length === 0 ? (
            <p className="muted">
              Nothing logged yet this month. <Link href="/" className="more-link">Log an episode</Link> to start the list.
            </p>
          ) : (
            <ol className="pop-list">
              {popular.map((s, i) => (
                <li key={s.showRef || s.feedId}>
                  <Link href={showHref(s.showRef, s.feedId)} className="results__row">
                    <span className="pop-list__rank display">{i + 1}</span>
                    <Art src={s.image} title={s.title} size={60} radius={14} />
                    <div className="min0">
                      <p className="title-sm">{s.title}</p>
                      <p className="mono small muted">
                        {[
                          plural(s.listeners, "listener"),
                          s.logs > s.listeners ? plural(s.logs, "log") : null,
                          `${s.hookedPct}% hooked`,
                          s.avg ? `★ ${s.avg.toFixed(1)}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {!query && <ForYou compact />}

      {!query && (chart.length > 0 || chartEps.episodes.length > 0) && (
        <section style={{ marginTop: 28 }}>
          <h2 className="label">Top on Apple Podcasts</h2>
          <p className="muted small" style={{ marginTop: -4, marginBottom: 12 }}>
            The top shows in the US, updated daily.
          </p>
          {chart.length > 0 && (
            <div className="trend">
              {chart.map((s, i) => (
                <Link
                  key={s.itunesId}
                  href={s.feedId ? showHref(s.showRef, s.feedId) : `/search?q=${encodeURIComponent(s.title)}&type=shows`}
                  className="trend__item"
                >
                  <span className="trend__rank display">{s.rank}</span>
                  <Art src={s.image} title={s.title} size="100%" radius={18} tilt={[-1.5, 1, -0.5][i % 3]} className="art--fluid" />
                  <p>{s.title}</p>
                </Link>
              ))}
            </div>
          )}
          {chartEps.episodes.length > 0 && (
            <>
              <h3 className="label" style={{ marginTop: 24 }}>Latest from the top shows</h3>
              <TopEpisodes initial={chartEps.episodes} next={chartEps.next} />
            </>
          )}
        </section>
      )}

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
    </>
  );
}
