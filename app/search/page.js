import Link from "next/link";
import Art from "@/components/Art";
import KeysNotice from "@/components/KeysNotice";
import { artOf, safe, searchShows, trendingShows } from "@/lib/podcastindex";
import { plural } from "@/lib/format";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const result = query ? await safe(searchShows(query)) : await safe(trendingShows(15));
  const shows = result.data || [];

  return (
    <>
      <h1 className="display h-lg cobalt">Search</h1>
      <p className="muted" style={{ marginTop: 6 }}>
        Find a show, pick an episode, log it.
      </p>

      <form className="search" action="/search" role="search">
        <input
          className="input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Shows, hosts, topics…"
          aria-label="Search podcasts"
          autoFocus={!query}
        />
        <button className="btn btn--cobalt btn--shadow-sm" type="submit">
          Search
        </button>
      </form>

      <KeysNotice error={result.error} />

      {!result.error && (
        <>
          <h2 className="label">{query ? `Shows matching “${query}”` : "Trending right now"}</h2>
          {shows.length === 0 ? (
            <p className="muted">Nothing found. Try a show name or a host.</p>
          ) : (
            <ul>
              {shows.map((s) => (
                <li key={s.id}>
                  <Link href={`/show/${s.id}`} className="results__row">
                    <Art src={artOf(s)} title={s.title} size={68} radius={14} />
                    <div className="min0">
                      <p className="title-sm">{s.title}</p>
                      <p className="muted small">{s.author || s.ownerName}</p>
                      {s.episodeCount > 0 && <p className="mono small muted">{plural(s.episodeCount, "episode")}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
