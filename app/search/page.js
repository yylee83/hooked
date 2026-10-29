import Link from "next/link";
import Art from "@/components/Art";
import EpisodeRow from "@/components/EpisodeRow";
import KeysNotice from "@/components/KeysNotice";
import { artOf, episodeCard, safe, searchEpisodes, searchShows } from "@/lib/podcastindex";
import { plural } from "@/lib/format";
import TrendingBar from "@/components/TrendingBar";
import { trendingTopics } from "@/lib/trends";
import { popularOnHooked, topChartEpisodes } from "@/lib/charts";

export const metadata = { title: "Search" };

const PAGE = 20;

function ShowRow({ s }) {
  return (
    <li>
      <Link href={`/show/${s.id}`} className="results__row">
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
  const query = (sp.q || "").trim();
  const type = sp.type === "shows" || sp.type === "episodes" ? sp.type : "all";
  const max = Math.min(200, Math.max(PAGE, parseInt(sp.max) || PAGE));

  const topicsPromise = trendingTopics(12);
  let error = null;
  let episodes = [];
  let shows = [];
  let topics = [];
  let popular = [];
  let chartEps = { episodes: [], more: false, count: 10 };

  if (query) {
    const [e, s] = await Promise.all([
      type === "shows" ? { data: [] } : safe(searchEpisodes(query, type === "episodes" ? max + 1 : 6)),
      type === "episodes" ? { data: [] } : safe(searchShows(query, type === "shows" ? max + 1 : 6)),
    ]);
    error = e.error || s.error;
    episodes = (e.data || []).map((x) => episodeCard(x));
    shows = s.data || [];
  } else {
    const epCount = Math.min(50, Math.max(10, parseInt(sp.eps) || 10));
    const [pop, top] = await Promise.all([popularOnHooked(30, 15), topChartEpisodes(epCount)]);
    popular = pop;
    chartEps = { ...top, count: epCount };
  }

  topics = await topicsPromise;
  const moreEpisodes = type === "episodes" && episodes.length > max;
  const moreShows = type === "shows" && shows.length > max;
  if (type === "episodes") episodes = episodes.slice(0, max);
  if (type === "shows") shows = shows.slice(0, max);

  return (
    <>
      <h1 className="display h-lg cobalt">Search</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        Find an episode or a show. Search a person to see everywhere they've been on.
      </p>

      <form className="search" action="/search" role="search">
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="People, shows, topics…"
          aria-label="Search podcasts"
          autoFocus={!query}
        />
        {type !== "all" && <input type="hidden" name="type" value={type} />}
        <button className="btn btn--cobalt btn--shadow-sm" type="submit">
          Search
        </button>
      </form>

      <TrendingBar topics={topics} inSearch />

      {query && (
        <div className="tabs" role="tablist">
          {[
            ["all", "All"],
            ["episodes", "Episodes"],
            ["shows", "Shows"],
          ].map(([k, label]) => (
            <Link key={k} href={href(query, k === "all" ? "" : k)} className={`tab ${type === k ? "is-on" : ""}`} role="tab" aria-selected={type === k}>
              {label}
            </Link>
          ))}
        </div>
      )}

      <KeysNotice error={error} />

      {!query && (
        <>
          <h2 className="label">Popular on Hooked on</h2>
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
                <li key={s.feedId}>
                  <Link href={`/show/${s.feedId}`} className="results__row">
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

      {!query && chartEps.episodes.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 className="label">Top episodes right now</h2>
          <p className="muted small" style={{ marginTop: -4, marginBottom: 8 }}>
            The newest episode from each of the top shows on Apple Podcasts.
          </p>
          <ul>
            {chartEps.episodes.map((e) => (
              <EpisodeRow key={e.id} ep={episodeCard(e)} desc={`#${e.chartRank} show on Apple Podcasts`} />
            ))}
          </ul>
          {chartEps.more && (
            <Link href={`/search?eps=${chartEps.count + 10}`} className="btn btn--shadow-sm load-more" scroll={false}>
              Load more episodes
            </Link>
          )}
        </section>
      )}

      {!error && query && type !== "shows" && (
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
                <EpisodeRow key={ep.id} ep={ep} />
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

      {!error && query && type !== "episodes" && (
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
                <ShowRow key={s.id} s={s} />
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
}
