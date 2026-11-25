// The lists under Search's box (Popular on Hooked, the Apple chart). Used by plain /search, which is
// made ahead of time (app/search/page.js), and by searches (app/search/find/page.js).
import Link from "next/link";
import Art from "./Art";
import TopEpisodes from "./TopEpisodes";
import { popularOnHooked, topChartEpisodes, topCharts } from "@/lib/charts";
import { plural } from "@/lib/format";
import { showHref } from "@/lib/addresses";

// A label with a soft placeholder row, while a list loads.
export function SectionLoading({ label }) {
  return (
    <>
      <h2 className="label">{label}</h2>
      <div className="page-loading__rows" aria-hidden="true" style={{ marginTop: 8 }}>
        <span />
      </div>
    </>
  );
}

export async function PopularOnHooked() {
  const popular = await popularOnHooked(30, 15);
  return (
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
  );
}

export async function AppleCharts() {
  const [chartEps, chart] = await Promise.all([topChartEpisodes(0, 10), topCharts(9)]);
  if (!chart.length && !chartEps.episodes.length) return null;
  return (
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
                  href={s.feedId ? showHref(s.showRef, s.feedId) : `/search/find?q=${encodeURIComponent(s.title)}&type=shows`}
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
  );
}

